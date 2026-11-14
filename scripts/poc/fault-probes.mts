import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { marker, mutate, type DB } from "./database.mts";
import {
  retryTransaction,
  type Target,
  type Operation,
  type JournalEvent,
} from "./core.mts";

// These probes run only after the CLI guard and each connection's database marker.
export async function retryStress(
  make: () => DB,
  target: Target,
  op: Operation,
  record: (e: JournalEvent) => void,
) {
  const connections = Array.from({ length: 10 }, () => make());
  try {
    for (const db of connections) {
      await db.connect();
      await marker(db, target);
    }
    const found = await connections[0].query(
      "SELECT id FROM loadpacket_poc.effects WHERE id=$1",
      [op.id],
    );
    assert.equal(
      found.rows.length,
      1,
      "Run workload/reconciliation first; stress may not create a missing original effect",
    );
    const run = async (db: DB, attempt: number) => {
      record({ ...op, attempt, phase: "SUBMITTED" });
      const start = performance.now();
      try {
        await mutate(db, op);
        record({
          ...op,
          attempt,
          phase: "RESULT",
          outcome: "ACKNOWLEDGED",
          elapsedMs: performance.now() - start,
        });
      } catch (e) {
        record({
          ...op,
          attempt,
          phase: "RESULT",
          outcome: "UNKNOWN_OUTCOME",
          elapsedMs: performance.now() - start,
        });
        throw e;
      }
    };
    for (let i = 0; i < 10; i++) await run(connections[0], 100 + i);
    const concurrent = await Promise.allSettled(
      connections.map((db, i) => run(db, 110 + i)),
    );
    assert(
      concurrent.every((r) => r.status === "fulfilled"),
      "Concurrent retry uncertainty; retain journal",
    );
    await assert.rejects(
      () => mutate(connections[0], { ...op, hash: "different-payload" }),
      { code: "ERR_ASSERTION" },
    );
    const effects = await connections[0].query(
      "SELECT tenant,amount::text AS amount FROM loadpacket_poc.effects WHERE id=$1",
      [op.id],
    );
    assert.equal(effects.rows.length, 1);
    assert.equal(effects.rows[0].tenant, op.tenant);
    assert.equal(effects.rows[0].amount, op.amount);
    return {
      status: "PASS_FOR_POC_IDEMPOTENCY_ONLY",
      sequential: 10,
      concurrent: 10,
      effects: 1,
      payloadConflict: "REJECTED",
      productionGate: "NOT_VERIFIED",
    };
  } finally {
    await Promise.allSettled(connections.map((db) => db.end()));
  }
}

export async function connectionAndDeadlockChecks(
  make: () => DB,
  target: Target,
) {
  const a = make(),
    b = make();
  await a.connect();
  await b.connect();
  try {
    await marker(a, target);
    await marker(b, target);
    // A graceful client disconnect inside an uncommitted transaction must roll back.
    // This is not a network drop or an after-COMMIT ambiguity experiment.
    await a.query("BEGIN");
    await a.query(
      "INSERT INTO loadpacket_poc.operations VALUES('DISCONNECT-PROBE','test','x',1.00)",
    );
    await a.end();
    assert.equal(
      (
        await b.query(
          "SELECT id FROM loadpacket_poc.operations WHERE id='DISCONNECT-PROBE'",
        )
      ).rows.length,
      0,
    );
    const c = make();
    await c.connect();
    try {
      await marker(c, target);
      await b.query(
        "INSERT INTO loadpacket_poc.operations VALUES('DEADLOCK-A','test','x',1.00),('DEADLOCK-B','test','x',1.00)",
      );
      let arrivals = 0,
        retries = 0;
      let release: () => void = () => {};
      const barrier = new Promise<void>((r) => {
        release = r;
      });
      const transaction = async (db: DB, first: string, second: string) => {
        let attempt = 0;
        await retryTransaction(async () => {
          const initial = attempt++ === 0;
          if (!initial) retries++;
          await db.query("BEGIN");
          try {
            await db.query(
              "SELECT id FROM loadpacket_poc.operations WHERE id=$1 FOR UPDATE",
              [first],
            );
            if (initial) {
              arrivals++;
              if (arrivals === 2) release();
              await barrier;
            }
            await db.query(
              "SELECT id FROM loadpacket_poc.operations WHERE id=$1 FOR UPDATE",
              [second],
            );
            await db.query("COMMIT");
          } catch (e) {
            release();
            await db.query("ROLLBACK").catch(() => {});
            throw e;
          }
        });
      };
      const outcomes = await Promise.allSettled([
        transaction(b, "DEADLOCK-A", "DEADLOCK-B"),
        transaction(c, "DEADLOCK-B", "DEADLOCK-A"),
      ]);
      assert(
        outcomes.every((o) => o.status === "fulfilled"),
        "Deadlock retry failed",
      );
      assert(retries > 0, "No deadlock/retry observed");
      await marker(b, target);
      await b.query(
        "DELETE FROM loadpacket_poc.operations WHERE id IN ('DEADLOCK-A','DEADLOCK-B')",
      );
      return {
        disconnectBeforeCommit: "PASS_CLIENT_DISCONNECT_ONLY",
        deadlockRetry: "PASS",
        retries,
        networkAndLeaderFaults: "NOT_RUN",
      };
    } finally {
      await c.end();
    }
  } finally {
    await Promise.allSettled([a.end(), b.end()]);
  }
}
