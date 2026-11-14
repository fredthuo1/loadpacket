import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import {
  hash,
  guard,
  retryTransaction,
  type Target,
  type Operation,
  type Stored,
} from "./core.mts";
import { fixtures } from "./fixtures.mts";

export interface DB {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}
export function identifier(name: string) {
  assert(/^[a-z_][a-z0-9_]*$/.test(name), "Unsafe identifier");
  return '"' + name + '"';
}
export function client(env: NodeJS.ProcessEnv, target: Target): DB {
  const checked = guard(env, target);
  const require = createRequire(
    new URL("../../apps/api/package.json", import.meta.url),
  );
  const pg = require("pg") as { Client: new (options: object) => DB };
  // No dotenv, default pg host, inherited URL, or logging of connection options.
  return new pg.Client({
    connectionString: checked.connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
    application_name: "loadpacket-poc-" + target.runId,
  });
}
export async function identity(db: DB, target: Target) {
  const {
    rows: [row],
  } = await db.query(
    "SELECT current_database() AS db,current_user AS usr,version() AS version",
  );
  assert.equal(row.db, target.database, "Connected to wrong database");
  assert.equal(row.usr, target.user, "Connected as wrong role");
  const version = String(row.version);
  const detected = /CockroachDB/i.test(version)
    ? "cockroach"
    : /Yugabyte|[- ]YB-/i.test(version)
      ? "yugabyte"
      : /^PostgreSQL /i.test(version)
        ? "postgres"
        : "unknown";
  assert.equal(
    detected,
    target.candidate,
    "Unexpected engine; do not label a different database as this candidate",
  );
  return version;
}
export async function marker(db: DB, target: Target) {
  await identity(db, target);
  const { rows } = await db.query(
    "SELECT run_id,candidate,nonce FROM loadpacket_poc.guard",
  );
  assert.equal(rows.length, 1, "POC marker count mismatch");
  assert.deepEqual(
    rows[0],
    { run_id: target.runId, candidate: target.candidate, nonce: target.nonce },
    "Database POC marker mismatch",
  );
}
export async function initialize(
  db: DB,
  target: Target,
  env: NodeJS.ProcessEnv,
) {
  assert.equal(
    env.LOADPACKET_POC_BOOTSTRAP,
    target.runId,
    "Explicit empty database bootstrap required",
  );
  await identity(db, target);
  const { rows } = await db.query(
    "SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema','crdb_internal') AND table_schema NOT LIKE 'pg_%'",
  );
  assert.equal(
    rows.length,
    0,
    "Bootstrap refuses any existing application/marker table",
  );
  await db.query("BEGIN");
  try {
    await db.query("CREATE SCHEMA loadpacket_poc");
    await db.query(
      "CREATE TABLE loadpacket_poc.guard(run_id TEXT PRIMARY KEY,candidate TEXT NOT NULL,nonce TEXT NOT NULL)",
    );
    await db.query("INSERT INTO loadpacket_poc.guard VALUES($1,$2,$3)", [
      target.runId,
      target.candidate,
      target.nonce,
    ]);
    await db.query(
      "CREATE TABLE loadpacket_poc.operations(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,hash TEXT NOT NULL,amount DECIMAL(12,2) NOT NULL)",
    );
    await db.query(
      "CREATE TABLE loadpacket_poc.effects(id TEXT PRIMARY KEY REFERENCES loadpacket_poc.operations(id),tenant TEXT NOT NULL,amount DECIMAL(12,2) NOT NULL)",
    );
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  }
}
export async function seed(db: DB, target: Target) {
  await marker(db, target);
  const rows = fixtures(target.runId);
  await db.query("BEGIN");
  try {
    // Rerun verifies identical state through snapshot, rather than upserting immutable evidence.
    const existing = await db.query(
      "SELECT id FROM organizations WHERE id=$1",
      [rows[0].row.id],
    );
    assert.equal(
      existing.rows.length,
      0,
      "Fixtures already exist; compare a snapshot or create a new disposable run",
    );
    for (const f of rows) {
      const keys = Object.keys(f.row);
      const vals = keys.map((k) =>
        Buffer.isBuffer(f.row[k])
          ? f.row[k]
          : typeof f.row[k] === "object" && f.row[k] !== null
            ? JSON.stringify(f.row[k])
            : f.row[k],
      );
      await db.query(
        `INSERT INTO public.${identifier(f.table)} (${keys.map(identifier).join(",")}) VALUES (${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
        vals,
      );
    }
    await db.query("COMMIT");
    return {
      rows: rows.length,
      models: new Set(rows.map((f) => f.model)).size,
    };
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  }
}
export async function mutate(db: DB, op: Operation) {
  // POC/TARGET CAPABILITY only. No provider/file effects inside retried callback.
  return retryTransaction(async () => {
    await db.query("BEGIN");
    try {
      await db.query(
        "INSERT INTO loadpacket_poc.operations(id,tenant,hash,amount) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
        [op.id, op.tenant, op.hash, op.amount],
      );
      const {
        rows: [row],
      } = await db.query(
        "SELECT id,tenant,hash,amount::text AS amount FROM loadpacket_poc.operations WHERE id=$1 FOR UPDATE",
        [op.id],
      );
      assert(
        row &&
          row.tenant === op.tenant &&
          row.hash === op.hash &&
          row.amount === op.amount,
        "Idempotency payload conflict",
      );
      await db.query(
        "INSERT INTO loadpacket_poc.effects VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
        [op.id, op.tenant, op.amount],
      );
      await db.query("COMMIT");
      return row as unknown as Stored;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  });
}
export async function stored(db: DB): Promise<Stored[]> {
  // Join reveals a committed operation missing its intended business effect.
  const { rows } = await db.query(
    "SELECT o.id,o.tenant,o.hash,e.amount::text AS amount FROM loadpacket_poc.operations o LEFT JOIN loadpacket_poc.effects e ON e.id=o.id ORDER BY o.id",
  );
  return rows as unknown as Stored[];
}
export async function snapshot(db: DB, target: Target) {
  await marker(db, target);
  const tables = [
    ...new Set(fixtures(target.runId).map((f) => f.table)),
  ].sort();
  const manifest: Record<string, { count: number; hash: string }> = {};
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    for (const table of tables) {
      const { rows } = await db.query(
        `SELECT to_jsonb(t) AS row FROM public.${identifier(table)} t ORDER BY id`,
      );
      manifest[table] = {
        count: rows.length,
        hash: hash(JSON.stringify(rows)),
      };
    }
    const ledger = await stored(db);
    await db.query("COMMIT");
    return {
      runId: target.runId,
      candidate: target.candidate,
      tables: manifest,
      ledger,
      objectBytes: "OUT_OF_SCOPE",
    };
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  }
}
export async function transactionChecks(make: () => DB, target: Target) {
  const a = make(),
    b = make();
  await a.connect();
  await b.connect();
  const checks: Record<string, string> = {};
  try {
    await marker(a, target);
    await marker(b, target);
    await a.query("BEGIN");
    await a.query(
      "INSERT INTO loadpacket_poc.operations VALUES('ROLLBACK','test','x',1.00)",
    );
    await a.query("ROLLBACK");
    assert.equal(
      (
        await a.query(
          "SELECT id FROM loadpacket_poc.operations WHERE id='ROLLBACK'",
        )
      ).rows.length,
      0,
    );
    checks.rollback = "PASS";
    await a.query("BEGIN");
    await a.query("SAVEPOINT nested");
    await a.query(
      "INSERT INTO loadpacket_poc.operations VALUES('NESTED','test','x',1.00)",
    );
    await a.query("ROLLBACK TO SAVEPOINT nested");
    await a.query("COMMIT");
    assert.equal(
      (
        await a.query(
          "SELECT id FROM loadpacket_poc.operations WHERE id='NESTED'",
        )
      ).rows.length,
      0,
    );
    checks.savepoint = "PASS";
    const op = {
      id: "LOCK-PROBE",
      key: "LOCK-PROBE",
      tenant: "test",
      hash: hash("lock"),
      amount: "1.00",
    };
    await Promise.all([mutate(a, op), mutate(b, op)]);
    checks.uniqueRace = "PASS";
    for (const kind of ["row", "advisory"]) {
      const sql =
        kind === "row"
          ? "SELECT id FROM loadpacket_poc.operations WHERE id='LOCK-PROBE' FOR UPDATE"
          : "SELECT pg_advisory_xact_lock(932741)";
      await a.query("BEGIN");
      await a.query(sql);
      await b.query("BEGIN");
      await b.query("SET LOCAL lock_timeout='250ms'");
      let blocked = false;
      try {
        await b.query(sql);
      } catch (e) {
        blocked = (e as { code?: string }).code === "55P03";
      }
      await b.query("ROLLBACK");
      await a.query("ROLLBACK");
      assert(blocked, kind + " lock did not block peer");
      checks[kind + "Lock"] = "PASS";
    }
    const start = performance.now();
    await a.query("SELECT 1");
    checks.readProbeMs = String(performance.now() - start);
    // Probe IDs are not ACK workload operations; remove only these known synthetic rows.
    await a.query("DELETE FROM loadpacket_poc.effects WHERE id='LOCK-PROBE'");
    await a.query(
      "DELETE FROM loadpacket_poc.operations WHERE id='LOCK-PROBE'",
    );
    return checks;
  } finally {
    await a.end();
    await b.end();
  }
}
