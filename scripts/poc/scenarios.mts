export const fields = [
  "PRECONDITION",
  "ACTION",
  "EXPECTED_DB_BEHAVIOR",
  "EXPECTED_API_BEHAVIOR",
  "EXPECTED_WRITE_BEHAVIOR",
  "EXPECTED_ACK_LEDGER",
  "PASS_CRITERIA",
  "FAIL_CRITERIA",
  "RECOVERY",
  "EVIDENCE_TO_CAPTURE",
] as const;
const definitions = [
  [
    "F01",
    "Database process/node loss",
    "Stop exactly one allowlisted data process after 10,000 journalled ACKs; repeat during in-flight writes.",
    "Surviving authority retains every committed effect.",
    "Restart through supported catch-up, verify placement.",
  ],
  [
    "F02",
    "Leader loss",
    "Identify and fence the actual leader/writer; terminate that process only after topology capture.",
    "Eligible quorum/lease-authorized survivor only; no stale promotion.",
    "Rejoin former leader as follower; verify authoritative epoch.",
  ],
  [
    "F03",
    "One-region loss",
    "Isolate all data, control and API nodes in A; repeat B and C separately.",
    "Remaining eligible data/control quorums preserve ACKs or fail closed.",
    "Restore links, catch up and reconcile before serving.",
  ],
  [
    "F04",
    "Inter-region network partition",
    "Partition A from B+C, retaining independent test-client access to each side.",
    "No two independently authoritative histories; strict PG needs lease AND remote durable copy.",
    "Heal links without forced promotion; compare every operation.",
  ],
  [
    "F05",
    "Minority partition writes",
    "While F04 holds, submit labelled writes directly to minority and majority endpoints.",
    "Minority cannot commit; DNS/routing changes cannot elect authority.",
    "Reconcile unknown minority attempts after healing.",
  ],
  [
    "F06",
    "Quorum loss",
    "Remove enough approved data/control voters or synchronous destinations to prevent safe commits.",
    "All unsafe authoritative writes stop; never reduce quorum or downgrade sync.",
    "Restore voters/required remote flush before reopening.",
  ],
  [
    "F07",
    "Response loss after commit",
    "Use workload dropEvery=10: commit a transaction, deliberately suppress observed response.",
    "One durable operation and effect; client records UNKNOWN_OUTCOME.",
    "Retry exact same tenant/key/hash after authoritative lookup.",
  ],
  [
    "F08",
    "Repeated idempotent retry",
    "Retry each F07 key ten times concurrently and sequentially; change payload once.",
    "Identical key replays one effect; different hash conflicts.",
    "Retain operation/tombstone and original result.",
  ],
  [
    "F09",
    "Node rejoin",
    "Return an out-of-date previously fenced node after majority continued writes.",
    "Catch-up before eligible voting/serving; no divergent data.",
    "Wait for stable placement, verify full manifest.",
  ],
  [
    "F10",
    "Failback",
    "After F09, perform only vendor-supported planned leadership transfer with old authority fenced.",
    "No stale DNS rollback or independent leader; correct strong reads.",
    "Abort failback and retain proven current authority if unsafe.",
  ],
  [
    "F11",
    "Snapshot restore",
    "Restore a coordinated synthetic snapshot into a NEW isolated marked target.",
    "Consistent schema, tenant graph, exact Finance/evidence/audit manifest at snapshot boundary.",
    "Compare expected boundary manifest and ledger; retain source.",
  ],
  [
    "F12",
    "PITR/equivalent restore",
    "Restore to declared target timestamp just before synthetic corruption using retained WAL/equivalent.",
    "Reconstructed point-in-time state matches boundary; later valid ACKs accounted separately.",
    "Reconcile reviewed post-target operations before hypothetical cutover.",
  ],
  [
    "F13",
    "Logical corruption recovery",
    "On a disposable copy only, alter/delete labelled synthetic rows then recover an earlier trusted boundary.",
    "Corruption is detected; independent backup restores exact tenant/value/link history.",
    "Preserve original reference and corrupt-copy evidence; no customer cutover.",
  ],
];
export const scenarios = definitions.map(
  ([id, title, action, db, recovery]) => ({
    id,
    title,
    PRECONDITION:
      "Explicit POC guard and DB marker, exact topology/failure scope, independent durable journal, reviewed fault adapter, safe rollback access; 10,000 ACK baseline. Restore cases require a boundary manifest. No production endpoint or resource.",
    ACTION: action,
    EXPECTED_DB_BEHAVIOR: db,
    EXPECTED_API_BEHAVIOR:
      "Current API behavior measured separately; POC target distinguishes definite rejection from unknown outcome. No success before qualifying commit.",
    EXPECTED_WRITE_BEHAVIOR:
      "Only authoritative/quorum side accepts; no minority election by DNS or load balancer. DB and end-to-end observations recorded separately.",
    EXPECTED_ACK_LEDGER:
      "Every pre-failure ACK present exactly once with matching tenant/hash/value. UNKNOWN_OUTCOME remains separate; reconcile same key. Restore denominator is explicit target-time ledger, with later ACK delta retained.",
    PASS_CRITERIA:
      "Zero missing ACKs, zero duplicate/conflicting effects, zero unsafe/minority committed writes; all expected manifest checks pass and unknowns reconcile. Evidence must match declared scope; local simulation cannot qualify region loss.",
    FAIL_CRITERIA:
      "Any lost ACK, split brain, minority commit, mismatch, unsafe retry or corrupt restore is HARD_FAIL. Missing evidence/unsupported adapter is NOT_RUN, never PASS.",
    RECOVERY: recovery,
    EVIDENCE_TO_CAPTURE:
      "Run/candidate/version, exact resource IDs/regions/placement, authority epoch, fault start/end, operator/reviewer, strong-read endpoint, intent/result journal, recovered rows/manifest, DB and API latency, cost and cleanup evidence.",
  }),
);
export const transactionScenarios = [
  "commit",
  "rollback",
  "nested-service/savepoint",
  "concurrent-write",
  "unique-race",
  "row-lock",
  "advisory-lock",
  "serialization-retry",
  "deadlock-retry",
  "connection-loss-before-commit",
  "connection-loss-after-commit",
  "unknown-client-outcome",
  "leader-change",
];
export function validateScenarios() {
  if (scenarios.length !== 13) throw new Error("Incomplete failure matrix");
  for (const s of scenarios)
    for (const f of fields)
      if (!s[f]) throw new Error("Missing scenario field");
  return { status: "DEFINITIONS_VALID", scenarios: 13, execution: "NOT_RUN" };
}
