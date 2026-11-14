import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, fsyncSync, openSync, writeSync } from "node:fs";

export type Candidate = "postgres" | "cockroach" | "yugabyte";
export type Outcome = "ACKNOWLEDGED" | "REJECTED" | "UNKNOWN_OUTCOME";
export interface Target {
  runId: string;
  candidate: Candidate;
  database: string;
  user: string;
  port: number;
  nonce: string;
  isolationAttested: boolean;
}
export interface Operation {
  id: string;
  tenant: string;
  key: string;
  hash: string;
  amount: string;
}
export interface Attempt extends Operation {
  attempt: number;
  outcome: Outcome;
  elapsedMs: number;
}
export interface Stored {
  id: string;
  tenant: string;
  hash: string;
  amount: string;
}
export type JournalEvent =
  | (Operation & { phase: "SUBMITTED"; attempt: number })
  | (Attempt & { phase: "RESULT" });
export function journalAttempts(events: JournalEvent[]): Attempt[] {
  const submitted = new Map<string, Attempt>();
  for (const e of events) {
    const key = `${e.id}:${e.attempt}`;
    if (e.phase === "SUBMITTED") {
      assert(!submitted.has(key), "Duplicate submission");
      submitted.set(key, { ...e, outcome: "UNKNOWN_OUTCOME", elapsedMs: 0 });
    } else {
      const prior = submitted.get(key);
      assert(prior, "Result without submission");
      assert(
        prior.hash === e.hash &&
          prior.tenant === e.tenant &&
          prior.amount === e.amount,
        "Result identity mismatch",
      );
      assert(!("resolved" in prior), "Duplicate result");
      submitted.set(key, Object.assign({ ...e }, { resolved: true }));
    }
  }
  return [...submitted.values()];
}
export function hash(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
export function uuid(value: string) {
  const h = hash(value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function guard(env: NodeJS.ProcessEnv, target: Target) {
  assert.equal(env.LOADPACKET_POC, "true", "POC opt-in required");
  assert(!env.DATABASE_URL, "Ordinary DATABASE_URL must be absent");
  assert(
    ["postgres", "cockroach", "yugabyte"].includes(target.candidate),
    "Unknown candidate",
  );
  assert(/^[a-z0-9]{8,24}$/.test(target.runId), "Invalid run ID");
  assert.equal(env.LOADPACKET_POC_RUN_ID, target.runId, "Run mismatch");
  assert.equal(
    env.LOADPACKET_POC_TARGET,
    target.candidate,
    "Candidate mismatch",
  );
  assert.equal(
    target.database,
    `loadpacket_poc_${target.runId}`,
    "Dedicated database required",
  );
  assert.equal(
    target.user,
    `lp_poc_${target.runId}`,
    "Dedicated user required",
  );
  assert(/^[a-f0-9]{64}$/.test(target.nonce), "Random marker nonce required");
  assert.equal(
    target.isolationAttested,
    true,
    "Operator must attest isolated synthetic target",
  );
  assert(
    Number.isInteger(target.port) &&
      target.port >= 55000 &&
      target.port <= 55999 &&
      target.port !== 55439,
    "Dedicated POC port required",
  );
  let url: URL;
  try {
    url = new URL(env.LOADPACKET_POC_DATABASE_URL ?? "");
  } catch {
    throw new Error("Explicit POC connection required");
  }
  assert(
    ["postgres:", "postgresql:"].includes(url.protocol),
    "SQL protocol required",
  );
  assert.equal(
    url.hostname,
    "127.0.0.1",
    "Only explicit loopback endpoints supported; no provider hosts",
  );
  assert.equal(url.port, String(target.port), "Port mismatch");
  assert.equal(url.pathname, "/" + target.database, "Database mismatch");
  assert.equal(decodeURIComponent(url.username), target.user, "User mismatch");
  assert(
    !url.search && !url.hash,
    "Connection options must not redirect or weaken the target",
  );
  return { ...target, connectionString: url.href };
}
export function operations(count = 10000): Operation[] {
  assert(
    Number.isInteger(count) && count >= 1 && count <= 100000,
    "Invalid operation count",
  );
  return Array.from({ length: count }, (_, i) => {
    const id = `WRITE-${String(i + 1).padStart(6, "0")}`;
    const tenant = i % 2 ? "fictional-b" : "fictional-a";
    return {
      id,
      tenant,
      key: id,
      amount: "12.34",
      hash: hash(`${tenant}|${id}|12.34`),
    };
  });
}
export class Journal {
  private fd: number;
  constructor(file: string) {
    this.fd = openSync(file, "wx", 0o600);
  }
  append(value: unknown) {
    const bytes = Buffer.from(JSON.stringify(value) + "\n");
    let offset = 0;
    while (offset < bytes.length)
      offset += writeSync(this.fd, bytes, offset, bytes.length - offset);
    fsyncSync(this.fd);
  }
  close() {
    closeSync(this.fd);
  }
}
export function reconcile(
  plan: Operation[],
  attempts: Attempt[],
  rows: Stored[],
) {
  assert(
    new Set(plan.map((p) => p.id)).size === plan.length,
    "Duplicate plan IDs",
  );
  const expected = new Map(plan.map((p) => [p.id, p]));
  const groups = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const p = expected.get(a.id);
    assert(p, "Unknown journal operation");
    assert(
      ["ACKNOWLEDGED", "REJECTED", "UNKNOWN_OUTCOME"].includes(a.outcome),
      "Invalid outcome",
    );
    assert(
      a.hash === p.hash &&
        a.tenant === p.tenant &&
        a.key === p.key &&
        a.amount === p.amount,
      "Journal identity mismatch",
    );
    assert(Number.isInteger(a.attempt) && a.attempt > 0, "Invalid attempt");
    const g = groups.get(a.id) ?? [];
    assert(
      !g.some((x) => x.attempt === a.attempt),
      "Duplicate journal attempt",
    );
    g.push(a);
    groups.set(a.id, g);
  }
  let acknowledged = 0,
    rejected = 0,
    unknown = 0,
    present = 0,
    missing = 0,
    duplicates = 0,
    mismatches = 0,
    unresolved = 0,
    rejectedPresent = 0;
  const actual = new Map<string, Stored[]>();
  for (const r of rows) {
    assert(expected.has(r.id), "Unplanned authoritative row");
    const g = actual.get(r.id) ?? [];
    g.push(r);
    actual.set(r.id, g);
  }
  for (const [id, g] of groups) {
    const p = expected.get(id)!;
    const r = actual.get(id) ?? [];
    const ack = g.some((a) => a.outcome === "ACKNOWLEDGED");
    const uncertain = !ack && g.some((a) => a.outcome === "UNKNOWN_OUTCOME");
    if (ack) acknowledged++;
    else if (uncertain) unknown++;
    else rejected++;
    if (r.length) present++;
    if (ack && !r.length) missing++;
    if (uncertain && !r.length) unresolved++;
    if (!ack && !uncertain && r.length) rejectedPresent++;
    if (
      r.some(
        (x) =>
          x.hash !== p.hash || x.tenant !== p.tenant || x.amount !== p.amount,
      )
    )
      mismatches++;
  }
  for (const r of actual.values()) duplicates += Math.max(0, r.length - 1);
  return {
    attempted: groups.size,
    attempt_records: attempts.length,
    acknowledged,
    rejected,
    unknown,
    present_after_recovery: present,
    missing_acknowledged: missing,
    duplicate_authoritative_records: duplicates,
    mismatched_records: mismatches,
    unresolved_unknown: unresolved,
    rejected_but_present: rejectedPresent,
    unattempted: plan.length - groups.size,
    status:
      missing || duplicates || mismatches || rejectedPresent
        ? "HARD_FAIL"
        : unresolved || groups.size !== plan.length || acknowledged === 0
          ? "INCOMPLETE"
          : "PASS_FOR_OBSERVED_LEDGER_ONLY",
  };
}
export function percentiles(samples: number[]) {
  assert(
    samples.every((n) => Number.isFinite(n) && n >= 0),
    "Invalid latency",
  );
  const s = [...samples].sort((a, b) => a - b);
  const at = (p: number) =>
    s.length ? s[Math.max(0, Math.ceil(p * s.length) - 1)] : null;
  return { count: s.length, p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}
export async function retryTransaction<T>(
  work: () => Promise<T>,
  maximum = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++)
    try {
      return await work();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (!["40001", "40P01"].includes(code ?? "") || attempt >= maximum)
        throw e;
      await new Promise((resolve) => setTimeout(resolve, attempt * 20));
    }
}
export const hardRequirements = [
  "rpo",
  "consistency",
  "splitBrain",
  "transactions",
  "schema",
  "recovery",
  "operatingModel",
] as const;
export function qualifiedDecision(hard: Record<string, string>) {
  const values = Object.values(hard);
  if (values.some((v) => v === "FAIL")) return "DISQUALIFIED";
  return values.length === 7 &&
    hardRequirements.every((k) => hard[k] === "PASS")
    ? "ELIGIBLE_FOR_REVIEW"
    : "NOT_QUALIFIED";
}
