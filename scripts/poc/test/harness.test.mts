import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  guard,
  operations,
  reconcile,
  journalAttempts,
  hash,
  Journal,
  percentiles,
  retryTransaction,
  qualifiedDecision,
  type Target,
  type Attempt,
  type Stored,
} from "../core.mts";
import { fixtures } from "../fixtures.mts";
import { inventory } from "../schema.mts";
import { validateScenarios, scenarios } from "../scenarios.mts";
import { bom, validateBom, cost } from "../bom.mts";
import {
  summarize,
  measure,
  runLatencySuite,
  workloadNames,
  type Workloads,
  type Sample,
} from "../latency.mts";
import { marker, initialize, type DB } from "../database.mts";
import { safeChildEnvironment } from "../application.mts";
const target: Target = {
  runId: "localpoc01",
  candidate: "postgres",
  database: "loadpacket_poc_localpoc01",
  user: "lp_poc_localpoc01",
  port: 55480,
  nonce: hash("test-only-marker"),
  isolationAttested: true,
};
const env = {
  LOADPACKET_POC: "true",
  LOADPACKET_POC_RUN_ID: target.runId,
  LOADPACKET_POC_TARGET: target.candidate,
  LOADPACKET_POC_DATABASE_URL: `postgresql://${target.user}@127.0.0.1:55480/${target.database}`,
};
test("guard accepts only explicit dedicated target", () =>
  assert.equal(guard(env, target).database, target.database));
for (const [label, changed] of Object.entries({
  noOptIn: { LOADPACKET_POC: "false" },
  ambient: { DATABASE_URL: "must-not-use" },
  noPocUrl: { LOADPACKET_POC_DATABASE_URL: undefined },
  wrongRun: { LOADPACKET_POC_RUN_ID: "different" },
  wrongCandidate: { LOADPACKET_POC_TARGET: "cockroach" },
  remote: {
    LOADPACKET_POC_DATABASE_URL:
      "postgresql://lp_poc_localpoc01@project.supabase.co:55480/loadpacket_poc_localpoc01",
  },
  normalDb: {
    LOADPACKET_POC_DATABASE_URL:
      "postgresql://postgres@127.0.0.1:55439/loadpacket_finance_verified_test",
  },
  options: {
    LOADPACKET_POC_DATABASE_URL:
      env.LOADPACKET_POC_DATABASE_URL + "?host=remote",
  },
  malformed: { LOADPACKET_POC_DATABASE_URL: "not a url" },
}))
  test("guard refuses " + label, () =>
    assert.throws(() => guard({ ...env, ...changed }, target)),
  );
test("guard refuses bootstrap naming tricks and missing attestation", () => {
  for (const change of [
    { runId: "../../prod" },
    { user: "postgres" },
    { database: "loadpacket" },
    { isolationAttested: false },
    { port: 5432 },
    { nonce: "short" },
  ])
    assert.throws(() => guard(env, { ...target, ...change } as Target));
});
test("source inventory exhaustively retains models/enums/migrations", () => {
  const i = inventory();
  assert.equal(i.models.length, 26);
  assert.equal(i.enums.length, 26);
  assert.equal(i.migrations.length, 17);
  assert(i.migrations.some((m) => m.sql.includes("pg_advisory_xact_lock")));
});
test("fixtures deterministic, fictional, all 26 models and both tenants", () => {
  const rows = fixtures("localpoc01");
  assert.deepEqual(rows, fixtures("localpoc01"));
  assert.notDeepEqual(rows, fixtures("localpoc02"));
  assert.deepEqual(
    [...new Set(rows.map((r) => r.model))].sort(),
    inventory()
      .models.map((m) => m.name)
      .sort(),
  );
  const orgs = rows
    .filter((r) => r.model === "Organization")
    .map((r) => r.row.id);
  assert.equal(orgs.length, 2);
  for (const r of rows) {
    if (r.model !== "Organization")
      assert(orgs.includes(r.row.organization_id));
    if (r.row.email) assert(String(r.row.email).endsWith("@example.invalid"));
    if (r.row.amount) assert.equal(typeof r.row.amount, "string");
  }
  assert(!rows.some((r) => r.row.role === "ADMIN"));
});
test("10000 deterministic ACKs survive independently supplied state", () => {
  const plan = operations();
  const a = plan.map((p) => ({
    ...p,
    attempt: 1,
    outcome: "ACKNOWLEDGED" as const,
    elapsedMs: 1,
  }));
  const report = reconcile(plan, a, plan);
  assert.equal(report.acknowledged, 10000);
  assert.equal(report.present_after_recovery, 10000);
  assert.equal(report.missing_acknowledged, 0);
  assert.equal(report.status, "PASS_FOR_OBSERVED_LEDGER_ONLY");
  assert.equal(reconcile(plan, a, plan.slice(1)).status, "HARD_FAIL");
});
test("unknown remains unknown and is not converted by later rejection", () => {
  const [p] = operations(1);
  const attempts: Attempt[] = [
    { ...p, attempt: 1, outcome: "UNKNOWN_OUTCOME", elapsedMs: 2 },
    { ...p, attempt: 2, outcome: "REJECTED", elapsedMs: 1 },
  ];
  const r = reconcile([p], attempts, []);
  assert.equal(r.unknown, 1);
  assert.equal(r.rejected, 0);
  assert.equal(r.status, "INCOMPLETE");
});
test("journal submitted intent without response recovers as UNKNOWN_OUTCOME", () => {
  const [p] = operations(1);
  const a = journalAttempts([{ ...p, phase: "SUBMITTED", attempt: 1 }]);
  assert.equal(a[0].outcome, "UNKNOWN_OUTCOME");
  assert.throws(() =>
    journalAttempts([
      {
        ...p,
        phase: "RESULT",
        attempt: 1,
        outcome: "ACKNOWLEDGED",
        elapsedMs: 0,
      },
    ]),
  );
});
test("response loss, same-key retry, one authoritative effect (simulation only)", () => {
  const plan = operations();
  const db = new Map<string, Stored>();
  const attempts: Attempt[] = [];
  for (const [i, p] of plan.entries()) {
    db.set(p.id, p);
    attempts.push({
      ...p,
      attempt: 1,
      outcome: i % 10 === 0 ? "UNKNOWN_OUTCOME" : "ACKNOWLEDGED",
      elapsedMs: 1,
    });
    if (i % 10 === 0) {
      const existing = db.get(p.id)!;
      assert.equal(existing.hash, p.hash);
      attempts.push({
        ...p,
        attempt: 2,
        outcome: "ACKNOWLEDGED",
        elapsedMs: 1,
      });
    }
  }
  const r = reconcile(plan, attempts, [...db.values()]);
  assert.equal(db.size, 10000);
  assert.equal(r.missing_acknowledged, 0);
  assert.equal(r.duplicate_authoritative_records, 0);
  assert.equal(
    attempts.filter((a) => a.outcome === "UNKNOWN_OUTCOME").length,
    1000,
  );
});
test("duplicate, mismatched and rejected-but-present effects fail", () => {
  const [p] = operations(1);
  const a: Attempt = {
    ...p,
    attempt: 1,
    outcome: "ACKNOWLEDGED",
    elapsedMs: 1,
  };
  assert.equal(reconcile([p], [a], [p, p]).status, "HARD_FAIL");
  assert.equal(
    reconcile([p], [a], [{ ...p, tenant: "wrong" }]).status,
    "HARD_FAIL",
  );
  assert.equal(
    reconcile([p], [{ ...a, outcome: "REJECTED" }], [p]).status,
    "HARD_FAIL",
  );
  assert.equal(reconcile([p], [], []).status, "INCOMPLETE");
  assert.throws(() => reconcile([p], [a, a], [p]));
});
test("fsynced journal refuses overwrite and preserves submitted/result records", () => {
  const dir = mkdtempSync(join(tmpdir(), "lp-poc-journal-"));
  try {
    const file = join(dir, "journal");
    const j = new Journal(file);
    j.append({ phase: "SUBMITTED" });
    j.append({ phase: "RESULT" });
    j.close();
    assert.equal(readFileSync(file, "utf8").trim().split("\n").length, 2);
    assert.throws(() => new Journal(file));
  } finally {
    rmSync(join(dir, "journal"), { force: true });
    rmdirSync(dir);
  }
});
test("bounded retry only handles serialization/deadlock, never connection uncertainty", async () => {
  for (const code of ["40001", "40P01"]) {
    let n = 0;
    assert.equal(
      await retryTransaction(async () => {
        if (n++ < 2) throw { code };
        return "ok";
      }),
      "ok",
    );
    assert.equal(n, 3);
  }
  let n = 0;
  await assert.rejects(() =>
    retryTransaction(async () => {
      n++;
      throw { code: "08006" };
    }),
  );
  assert.equal(n, 1);
});
test("latency separates layers, failures and absent measurements", async () => {
  assert.deepEqual(percentiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), {
    count: 10,
    p50: 5,
    p95: 10,
    p99: 10,
  });
  assert.equal(percentiles([]).p99, null);
  const s: Sample[] = [];
  await measure(s, "simple-read", "database", "normal", async () => 1);
  await assert.rejects(() =>
    measure(s, "simple-write", "api", "loss", async () => {
      throw new Error("expected");
    }),
  );
  const r = summarize(s);
  assert.equal(r.length, 16);
  assert(r.some((x) => x.status === "NOT_RUN"));
  assert.equal(
    r.find((x) => x.operation === "simple-write" && x.layer === "api")!
      .failures,
    1,
  );
});
test("13 failure definitions and teardown BOM pass structural gates", () => {
  assert.equal(validateScenarios().scenarios, 13);
  assert(
    scenarios
      .find((s) => s.id === "F05")!
      .EXPECTED_DB_BEHAVIOR.includes("Minority"),
  );
  validateBom(bom());
  assert.throws(() => validateBom([...bom(), bom()[0]]));
});
test("unverified pricing blocks maximum; exact integer verified inputs enforce cap", () => {
  assert.equal(cost(bom()).maximumUsd, null);
  const r = bom()[0];
  assert.equal(
    cost([
      { ...r, priceStatus: "VERIFIED", unitMicroUsd: "1000000", units: 151 },
    ]).status,
    "OVER_BUDGET",
  );
  assert.equal(
    cost([
      { ...r, priceStatus: "VERIFIED", unitMicroUsd: "1000000", units: 150 },
    ]).maximumUsd,
    "150.000000",
  );
});
test("hard failure disqualifies regardless of preferences; missing evidence never qualifies", () => {
  assert.equal(qualifiedDecision({ rpo: "FAIL" }), "DISQUALIFIED");
  assert.equal(qualifiedDecision({ rpo: "PASS" }), "NOT_QUALIFIED");
});
test("child environment has no ambient provider credentials", () => {
  const prior = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SECRET_KEY = "synthetic-test-only";
  try {
    const child = safeChildEnvironment("poc-only", "/poc");
    assert(!child.SUPABASE_SECRET_KEY);
    assert.equal(child.NODE_ENV, "test");
  } finally {
    if (prior === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = prior;
  }
});
test("database marker rejects wrong identity or marker before any write", async () => {
  for (const wrongIdentity of [true, false]) {
    const queries: string[] = [];
    const db: DB = {
      connect: async () => {},
      end: async () => {},
      query: async (sql) => {
        queries.push(sql);
        return {
          rows: sql.includes("current_database")
            ? [
                {
                  db: wrongIdentity ? "ordinary" : target.database,
                  usr: target.user,
                  version: "PostgreSQL 17",
                },
              ]
            : [
                {
                  run_id: "wrong",
                  candidate: target.candidate,
                  nonce: target.nonce,
                },
              ],
          rowCount: 1,
        };
      },
    };
    await assert.rejects(() => marker(db, target));
    assert(queries.every((q) => q.startsWith("SELECT")));
  }
});
test("bootstrap refuses existing application tables without mutating them", async () => {
  const queries: string[] = [];
  const db: DB = {
    connect: async () => {},
    end: async () => {},
    query: async (sql) => {
      queries.push(sql);
      return {
        rows: sql.includes("current_database")
          ? [
              {
                db: target.database,
                usr: target.user,
                version: "PostgreSQL 17",
              },
            ]
          : [{ table_name: "organizations" }],
        rowCount: 1,
      };
    },
  };
  await assert.rejects(() =>
    initialize(db, target, { LOADPACKET_POC_BOOTSTRAP: target.runId }),
  );
  assert(queries.every((q) => q.startsWith("SELECT")));
});
test("fixtures supply every required scalar and use real enum members", () => {
  const source = inventory(),
    models = new Set(source.models.map((m) => m.name));
  for (const f of fixtures(target.runId)) {
    const columns = source.models
      .find((m) => m.name === f.model)!
      .declarations.filter((l) => !l.startsWith("@@"))
      .map((l) => /@map\("([^"]+)"\)/.exec(l)?.[1] ?? l.split(/\s+/)[0]);
    for (const key of Object.keys(f.row))
      assert(columns.includes(key), `${f.model}.${key} unknown column`);
  }
  for (const f of fixtures(target.runId))
    for (const line of source.models.find((m) => m.name === f.model)!
      .declarations) {
      const match = /^(\w+)\s+(\w+)(\[\]|\?)?(.*)$/.exec(line);
      if (!match || models.has(match[2]) || match[3] === "[]") continue;
      const [, name, type, optional, attrs] = match,
        column = /@map\("([^"]+)"\)/.exec(attrs)?.[1] ?? name;
      if (!optional && !attrs.includes("@default("))
        assert(column in f.row, `${f.model}.${column} required`);
      const e = source.enums.find((e) => e.name === type);
      if (e && f.row[column] !== undefined)
        assert(
          e.values.includes(String(f.row[column])),
          `${f.model}.${column} enum`,
        );
    }
});
test("benchmark runs all eight bindings, excludes warmup and retains failures", async () => {
  const work = Object.fromEntries(
    workloadNames.map((name) => [
      name,
      async () => {
        if (name === "signature-commit") throw new Error("fault");
      },
    ]),
  ) as unknown as Workloads;
  const samples = await runLatencySuite(work, "api", "partition", 2, 0);
  assert.equal(samples.length, 16);
  assert.equal(samples.filter((s) => !s.success).length, 2);
  await assert.rejects(() => runLatencySuite(work, "api", "normal", 2, 1));
  assert.throws(() =>
    summarize([
      {
        operation: "made-up",
        layer: "api",
        phase: "normal",
        success: true,
        elapsedMs: 1,
      },
    ]),
  );
});
