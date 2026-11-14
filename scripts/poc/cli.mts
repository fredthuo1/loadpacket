import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  guard,
  Journal,
  operations,
  reconcile,
  journalAttempts,
  type JournalEvent,
  type Target,
  type Attempt,
} from "./core.mts";
import { fixtures } from "./fixtures.mts";
import {
  client,
  marker,
  initialize,
  seed,
  stored,
  snapshot,
  transactionChecks,
} from "./database.mts";
import { mutate } from "./database.mts";
import { inventory, catalog, root } from "./schema.mts";
import {
  commands,
  prepareWorkspace,
  safeChildEnvironment,
  executeCommand,
} from "./application.mts";
import { scenarios, validateScenarios } from "./scenarios.mts";
import { bom, validateBom, cost } from "./bom.mts";
import { summarize, runLatencySuite, type Sample } from "./latency.mts";
import { databaseWorkloads } from "./latency-workloads.mts";
import { qualify } from "./qualification.mts";
import { retryStress, connectionAndDeadlockChecks } from "./fault-probes.mts";

async function main() {
  const [command, manifestPath, arg] = process.argv.slice(2);
  assert(
    command && manifestPath,
    "Usage: node scripts/poc/cli.mts <plan|prepare|init|schema|catalog|seed|checks|application|database-suites|workload|retry-unknown|reconcile|snapshot|restore-compare|latency-report|cleanup-plan> <target.json> [argument]",
  );
  const target = JSON.parse(readFileSync(manifestPath, "utf8")) as Target;
  const config = guard(process.env, target);
  const output = resolve(
    root,
    "test-results/poc",
    target.runId,
    target.candidate,
  );
  mkdirSync(output, { recursive: true });
  const save = (name: string, value: unknown) =>
    writeFileSync(
      join(output, name + ".json"),
      JSON.stringify(value, null, 2) + "\n",
      { mode: 0o600 },
    );
  if (command === "plan") {
    const source = inventory();
    save("inventory", source);
    save("fixtures", fixtures(target.runId));
    save("scenarios", scenarios);
    save("bom", bom());
    save("dry-run", {
      status: "DRY_RUN_NO_CONNECTION",
      source: {
        models: source.models.length,
        enums: source.enums.length,
        migrations: source.migrations.length,
      },
      scenarios: validateScenarios(),
      bom: validateBom(bom()),
      cost: cost(bom()),
      commands,
    });
    console.log("PASS: offline plan generated; no database connection.");
    return;
  }
  if (command === "prepare") {
    prepareWorkspace(output, target);
    console.log("PASS: isolated API copy prepared; no database connection.");
    return;
  }
  if (command === "cleanup-plan") {
    save("teardown", {
      status: "PLAN_ONLY",
      manifest: validateBom(bom()),
      resources: bom(),
      requiredMarker: target.runId,
      instructions:
        "No cloud/delete executor is implemented. Map actual provider IDs and verify account/tags before LP-PROD-002B teardown.",
    });
    return;
  }
  if (command === "restore-compare") {
    assert(arg, "Expected boundary snapshot path required");
    const expected = JSON.parse(readFileSync(arg, "utf8"));
    const actual = JSON.parse(
      readFileSync(join(output, "snapshot.json"), "utf8"),
    );
    assert.equal(expected.runId, actual.runId);
    assert.equal(expected.candidate, actual.candidate);
    assert.deepEqual(
      actual.tables,
      expected.tables,
      "Restored counts/content/ownership differ",
    );
    assert.deepEqual(
      actual.ledger,
      expected.ledger,
      "Restored operation ledger differs",
    );
    save("restore-comparison", {
      status: "PASS_FOR_DECLARED_BOUNDARY",
      objectBytes: "OUT_OF_SCOPE",
      laterAcknowledgedDelta: "MUST_BE_RECONCILED_SEPARATELY",
    });
    return;
  }
  if (command === "latency-report") {
    assert(arg, "Sample JSON path required");
    save(
      "latency",
      summarize(JSON.parse(readFileSync(arg, "utf8")) as Sample[]),
    );
    return;
  }
  assert(
    [
      "init",
      "schema",
      "catalog",
      "seed",
      "qualify",
      "checks",
      "application",
      "database-suites",
      "workload",
      "retry-unknown",
      "reconcile",
      "snapshot",
      "latency-database",
      "retry-stress",
      "disconnect-deadlock",
    ].includes(command),
    "Unknown command; no database connected",
  );
  const db = client(process.env, target);
  await db.connect();
  try {
    if (command === "init") {
      await initialize(db, target, process.env);
      save("bootstrap", { status: "MARKED_EMPTY_POC_DATABASE" });
      return;
    }
    await marker(db, target);
    if (["schema", "application", "database-suites"].includes(command)) {
      const api = join(output, "workspace/apps/api");
      assert(existsSync(api), "Run prepare first");
      if (target.candidate === "cockroach")
        throw new Error(
          "BLOCKED_COCKROACH_CONNECTOR_BASELINE: production Prisma provider/migrations are not silently rewritten; use catalog/SQL POC after reviewed equivalent baseline",
        );
      const stage =
        command === "schema"
          ? "prisma"
          : command === "application"
            ? "application"
            : "database";
      if (stage === "prisma") {
        const roles = await db.query(
          "SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')",
        );
        assert.equal(
          roles.rows.length,
          2,
          "Create inert NOLOGIN anon/authenticated roles in this disposable cluster using approved setup identity before unchanged migration replay",
        );
      }
      const results = [];
      for (const [i, args] of commands[stage].entries()) {
        await marker(db, target);
        const result = executeCommand(
          api,
          args,
          safeChildEnvironment(config.connectionString, api),
          join(output, `${stage}-${i}.log`),
        );
        results.push(result);
        save(stage, results);
        if (result.status === "FAIL")
          throw new Error("QUALIFICATION_FAILED: inspect redacted stage log");
      }
      if (stage === "prisma") save("catalog", await catalog(db));
      return;
    }
    if (command === "catalog") {
      save("catalog", await catalog(db));
      return;
    }
    if (command === "seed") {
      save("seed", await seed(db, target));
      return;
    }
    if (command === "qualify") {
      save("qualification", await qualify(db, target));
      return;
    }
    if (command === "checks") {
      save(
        "transactions",
        await transactionChecks(() => client(process.env, target), target),
      );
      return;
    }
    if (command === "disconnect-deadlock") {
      save(
        "disconnect-deadlock",
        await connectionAndDeadlockChecks(
          () => client(process.env, target),
          target,
        ),
      );
      return;
    }
    if (command === "retry-stress") {
      const events = readFileSync(join(output, "ack.jsonl"), "utf8")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => JSON.parse(l) as JournalEvent);
      const attempts = journalAttempts(events),
        unknown = new Set(
          attempts
            .filter((a) => a.outcome === "UNKNOWN_OUTCOME")
            .map((a) => a.id),
        );
      const selected = unknown.size
        ? operations().filter((op) => unknown.has(op.id))
        : operations(1);
      const journal = new Journal(join(output, "stress.jsonl"));
      try {
        const results = [];
        for (const op of selected) {
          results.push({
            id: op.id,
            ...(await retryStress(
              () => client(process.env, target),
              target,
              op,
              (event) => journal.append(event),
            )),
          });
          save("stress", results);
        }
      } finally {
        journal.close();
      }
      return;
    }
    if (command === "latency-database") {
      assert(arg, "Unique batch label required");
      const samples = await runLatencySuite(
        await databaseWorkloads(db, target, arg),
        "database",
        "normal",
      );
      save("latency-samples-" + arg, samples);
      save("latency-" + arg, summarize(samples));
      assert(
        samples.every((s) => s.success),
        "Latency workload failures; see samples",
      );
      return;
    }
    if (command === "snapshot") {
      save("snapshot", await snapshot(db, target));
      return;
    }
    const plan = operations();
    const readEvents = (name: string): JournalEvent[] =>
      readFileSync(join(output, name), "utf8")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => JSON.parse(l) as JournalEvent);
    if (command === "workload" || command === "retry-unknown") {
      const retry = command === "retry-unknown";
      const journal = new Journal(
        join(output, retry ? "retry.jsonl" : "ack.jsonl"),
      );
      const prior = retry ? journalAttempts(readEvents("ack.jsonl")) : [];
      const selected = retry
        ? plan.filter((p) =>
            prior.some((a) => a.id === p.id && a.outcome === "UNKNOWN_OUTCOME"),
          )
        : plan;
      const dropEvery = retry ? 0 : Number(arg ?? 0);
      assert(
        Number.isInteger(dropEvery) && dropEvery >= 0,
        "Invalid drop interval",
      );
      try {
        for (const [i, op] of selected.entries()) {
          const attempt = retry ? 2 : 1;
          journal.append({ ...op, attempt, phase: "SUBMITTED" });
          let outcome: Attempt["outcome"] = "UNKNOWN_OUTCOME";
          let committed = false;
          const start = performance.now();
          try {
            await mutate(db, op);
            committed = true;
            if (!dropEvery || (i + 1) % dropEvery !== 0)
              outcome = "ACKNOWLEDGED";
          } catch {
            outcome = "UNKNOWN_OUTCOME";
          }
          journal.append({
            ...op,
            attempt,
            outcome,
            elapsedMs: performance.now() - start,
            phase: "RESULT",
          });
          // Stop on genuine uncertainty; intentional response suppression may continue.
          if (!committed) break;
        }
      } finally {
        journal.close();
      }
      save(retry ? "retry-summary" : "workload-summary", {
        status: "CLIENT_JOURNAL_SAVED_RECONCILE_REQUIRED",
        capability: "POC_TARGET_ONLY",
        failureDomain: "NOT_ESTABLISHED_BY_THIS_COMMAND",
        planned: plan.length,
        selected: selected.length,
      });
      return;
    }
    const events = readEvents("ack.jsonl");
    if (existsSync(join(output, "retry.jsonl")))
      events.push(...readEvents("retry.jsonl"));
    if (existsSync(join(output, "stress.jsonl")))
      events.push(...readEvents("stress.jsonl"));
    const report = reconcile(plan, journalAttempts(events), await stored(db));
    save("reconciliation", report);
    assert.equal(
      report.status,
      "PASS_FOR_OBSERVED_LEDGER_ONLY",
      "Reconciliation failed or incomplete; see saved report",
    );
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error(
    "POC FAILED OR BLOCKED. Review redacted reports and prerequisites; connection details intentionally omitted.",
  );
  process.exitCode = 1;
});
