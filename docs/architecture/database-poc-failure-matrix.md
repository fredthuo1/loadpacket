# Database failure matrix — LP-PROD-002A

Prepared 2026-10-02. **DEFINITIONS_VALID; ALL LIVE SCENARIOS NOT_RUN.** These are execution procedures for later explicitly authorized LP-PROD-002B. Local unit simulations cannot qualify regional durability. The CLI never issues cloud kill, network partition, promotion or restore commands. The actual provider adapter/resource allowlist must be reviewed before each fault.

## Common execution protocol

Freeze schema/engine/configuration and resource IDs; verify POC environment guard, actual database marker and independent ACK runner in site D. Begin a fresh run for each candidate/scenario trial. Seed actual schema, run compatibility/integration checks, and establish 10,000 durable pre-fault ACKs using workload without response suppression. Preserve an immutable journal copy and authoritative manifest. Record authority, replication/voting placement, remote flush/commit positions, time synchronization and failure boundaries before injection.

First run fault injection against a quiescent 10,000-ACK baseline, then a separately identified active-write trial. Reconcile before retries to detect lost original ACKs. During recovery, no quorum reduction, asynchronous fallback, forced stale promotion or disabling of constraints is permitted. Repeat eligible leader/region rotations. Capture minority client responses independently. DNS changes only routing; explicitly show direct minority writes cannot commit regardless of route. After healing, reconcile one authoritative history across all replicas.

For PostgreSQL, test loss of each remote synchronous recipient, leader lease/DCS reachability and old-writer fence. A control-plane majority without an eligible remote-durable data copy must fail closed. For Cockroach capture range voting placement/region-survival settings; for Yugabyte capture master and tablet voter placement. Merely seeing healthy node counts is insufficient.

## Automated transaction preparation

The checks command runs commit/rollback, savepoint, unique race and independent row/advisory locks. The disconnect-deadlock command closes an uncommitted client and creates an inverse row-lock deadlock across two connections, requiring a bounded retry to complete; it removes only its exact marked POC probe rows. It is NOT_RUN here. On failure, leave evidence and investigate leftover probe IDs before a fresh trial; no broad cleanup is authorized.

F07 uses workload with argument 10 for deliberate post-commit client-response suppression. This does not simulate a network packet drop. F08 retry-stress reads original UNKNOWN_OUTCOME IDs, requires their original effects already present, replays each ten times sequentially and ten concurrently, checks changed-payload conflict, and journals every same-key observed attempt in stress.jsonl. If no unknowns exist, it probes WRITE-000001 only and must not be reported as the full F07/F08 experiment. Single retry-unknown is also available. Reconcile first, stress, then reconcile again; preserve all histories.

Before-COMMIT network loss, after-COMMIT transport loss and leader change require a reviewed TCP fault proxy or node adapter in 002B, with deterministic barriers confirmed by server observations. Do not infer exact commit timing from a client timeout. Current application external side effects are not safe to blindly replay; the POC operation registry is separate target machinery.

## Restore boundary rules

For F11/F12/F13 save the reference snapshot under a separate immutable filename before restoring. Restore into a new isolated cluster with the original run marker/database/user and a different allowed local port; never initialize over restored tables. Capture the restored snapshot and run restore-compare. Retain original/corrupt/restored manifests, exact backup IDs/hashes and target-time/LSN information. All 26 table hashes include ownership, amounts and evidence links. Keep valid post-target ACK deltas separate and reconcile before any hypothetical cutover. No object bytes or customer cutover are covered.

## F01 — Database process/node loss

Status: NOT_RUN.

**PRECONDITION:** Explicit POC guard and DB marker, exact topology/failure scope, independent durable journal, reviewed fault adapter, safe rollback access; 10,000 ACK baseline. Restore cases require a boundary manifest. No production endpoint or resource.

**ACTION:** Stop exactly one allowlisted data process after 10,000 journalled ACKs; repeat during in-flight writes.

**EXPECTED DB BEHAVIOR:** Surviving authority retains every committed effect.

**EXPECTED API BEHAVIOR:** Current API behavior measured separately; POC target distinguishes definite rejection from unknown outcome. No success before qualifying commit.

**EXPECTED WRITE BEHAVIOR:** Only authoritative/quorum side accepts; no minority election by DNS or load balancer. DB and end-to-end observations recorded separately.

**EXPECTED ACK LEDGER:** Every pre-failure ACK present exactly once with matching tenant/hash/value. UNKNOWN_OUTCOME remains separate; reconcile same key. Restore denominator is explicit target-time ledger, with later ACK delta retained.

**PASS CRITERIA:** Zero missing ACKs, zero duplicate/conflicting effects, zero unsafe/minority committed writes; all expected manifest checks pass and unknowns reconcile. Evidence must match declared scope; local simulation cannot qualify region loss.

**FAIL CRITERIA:** Any lost ACK, split brain, minority commit, mismatch, unsafe retry or corrupt restore is HARD_FAIL. Missing evidence/unsupported adapter is NOT_RUN, never PASS.

**RECOVERY:** Restart through supported catch-up, verify placement.

**EVIDENCE TO CAPTURE:** Run/candidate/version, exact resource IDs/regions/placement, authority epoch, fault start/end, operator/reviewer, strong-read endpoint, intent/result journal, recovered rows/manifest, DB and API latency, cost and cleanup evidence.

## F02 — Leader loss

Status: NOT_RUN.

**PRECONDITION:** Explicit POC guard and DB marker, exact topology/failure scope, independent durable journal, reviewed fault adapter, safe rollback access; 10,000 ACK baseline. Restore cases require a boundary manifest. No production endpoint or resource.

**ACTION:** Identify and fence the actual leader/writer; terminate that process only after topology capture.

**EXPECTED DB BEHAVIOR:** Eligible quorum/lease-authorized survivor only; no stale promotion.

**EXPECTED API BEHAVIOR:** Current API behavior measured separately; POC target distinguishes definite rejection from unknown outcome. No success before qualifying commit.

**EXPECTED WRITE BEHAVIOR:** Only authoritative/quorum side accepts; no minority election by DNS or load balancer. DB and end-to-end observations recorded separately.

**EXPECTED ACK LEDGER:** Every pre-failure ACK present exactly once with matching tenant/hash/value. UNKNOWN_OUTCOME remains separate; reconcile same key. Restore denominator is explicit target-time ledger, with later ACK delta retained.

**PASS CRITERIA:** Zero missing ACKs, zero duplicate/conflicting effects, zero unsafe/minority committed writes; all expected manifest checks pass and unknowns reconcile. Evidence must match declared scope; local simulation cannot qualify region loss.

**FAIL CRITERIA:** Any lost ACK, split brain, minority commit, mismatch, unsafe retry or corrupt restore is HARD_FAIL. Missing evidence/unsupported adapter is NOT_RUN, never PASS.

**RECOVERY:** Rejoin former leader as follower; verify authoritative epoch.

**EVIDENCE TO CAPTURE:** Run/candidate/version, exact resource IDs/regions/placement, authority epoch, fault start/end, operator/reviewer, strong-read endpoint, intent/result journal, recovered rows/manifest, DB and API latency, cost and cleanup evidence.

## F03 — One-region loss

Status: NOT_RUN.

**PRECONDITION:** Explicit POC guard and DB marker, exact topology/failure scope, independent durable journal, reviewed fault adapter, safe rollback access; 10,000 ACK baseline. Restore cases require a boundary manifest. No production endpoint or resource.

**ACTION:** Isolate all data, control and API nodes in A; repeat B and C separately.

**EXPECTED DB BEHAVIOR:** Remaining eligible data/control quorums preserve ACKs or fail closed.

**EXPECTED API BEHAVIOR:** Current API behavior measured separately; POC target distinguishes definite rejection from unknown outcome. No success before qualifying commit.

**EXPECTED WRITE BEHAVIOR:** Only authoritative/quorum side accepts; no minority election by DNS or load balancer. DB and end-to-end observations recorded separately.

**EXPECTED ACK LEDGER:** Every pre-failure ACK present exactly once with matching tenant/hash/value. UNKNOWN_OUTCOME remains separate; reconcile same key. Restore denominator is explicit target-time ledger, with later ACK delta retained.

**PASS CRITERIA:** Zero missing ACKs, zero duplicate/conflicting effects, zero unsafe/minority committed writes; all expected manifest checks pass and unknowns reconcile. Evidence must match declared scope; local simulation cannot qualify region loss.

**FAIL CRITERIA:** Any lost ACK, split brain, minority commit, mismatch, unsafe retry or corrupt restore is HARD_FAIL. Missing evidence/unsupported adapter is NOT_RUN, never PASS.

**RECOVERY:** Restore links, catch up and reconcile before serving.

**EVIDENCE TO CAPTURE:** Run/candidate/version, exact resource IDs/regions/placement, authority epoch, fault start/end, operator/reviewer, strong-read endpoint, intent/result journal, recovered rows/manifest, DB and API latency, cost and cleanup evidence.

## F04 — Inter-region network partition

Status: NOT_RUN.

**PRECONDITION:** Explicit POC guard and DB marker, exact topology/failure scope, independent durable journal, reviewed fault adapter, safe rollback access; 10,000 ACK baseline. Restore cases require a boundary manifest. No production endpoint or resource.

**ACTION:** Partition A from B+C, retaining independent test-client access to each side.

**EXPECTED DB BEHAVIOR:** No two independently authoritative histories; strict PG needs lease AND remote durable copy.

**EXPECTED API BEHAVIOR:** Current API behavior measured separately; POC target distinguishes definite rejection from unknown outcome. No success before qualifying commit.

**EXPECTED WRITE BEHAVIOR:** Only authoritative/quorum side accepts; no minority election by DNS or load balancer. DB and end-to-end observations recorded separately.

**EXPECTED ACK LEDGER:** Every pre-failure ACK present exactly once with matching tenant/hash/value. UNKNOWN_OUTCOME remains separate; reconcile same key. Restore denominator is explicit target-time ledger, with later ACK delta retained.

**PASS CRITERIA:** Zero missing ACKs, zero duplicate/conflicting effects, zero unsafe/minority committed writes; all expected manifest checks pass and unknowns reconcile. Evidence must match declared scope; local simulation cannot qualify region loss.

**FAIL CRITERIA:** Any lost ACK, split brain, minority commit, mismatch, unsafe retry or corrupt restore is HARD_FAIL. Missing evidence/unsupported adapter is NOT_RUN, never PASS.

**RECOVERY:** Heal links without forced promotion; compare every operation.

**EVIDENCE TO CAPTURE:** Run/candidate/version, exact resource IDs/regions/placement, authority epoch, fault start/end, operator/reviewer, strong-read endpoint, intent/result journal, recovered rows/manifest, DB and API latency, cost and cleanup evidence.

## F05 — Minority partition writes

Status: NOT_RUN.

**PRECONDITION:** Explicit POC guard and DB marker, exact topology/failure scope, independent durable journal, reviewed fault adapter, safe rollback access; 10,000 ACK baseline. Restore cases require a boundary manifest. No production endpoint or resource.

**ACTION:** While F04 holds, submit labelled writes directly to minority and majority endpoints.

**EXPECTED DB BEHAVIOR:** Minority cannot commit; DNS/routing changes cannot elect authority.

**EXPECTED API BEHAVIOR:** Current API behavior measured separately; POC target distinguishes definite rejection from unknown outcome. No success before qualifying commit.

**EXPECTED WRITE BEHAVIOR:** Only authoritative/quorum side accepts; no minority election by DNS or load balancer. DB and end-to-end observations recorded separately.

**EXPECTED ACK LEDGER:** Every pre-failure ACK present exactly once with matching tenant/hash/value. UNKNOWN_OUTCOME remains separate; reconcile same key. Restore denominator is explicit target-time ledger, with later ACK delta retained.

**PASS CRITERIA:** Zero missing ACKs, zero duplicate/conflicting effects, zero unsafe/minority committed writes; all expected manifest checks pass and unknowns reconcile. Evidence must match declared scope; local simulation cannot qualify region loss.

**FAIL CRITERIA:** Any lost ACK, split brain, minority commit, mismatch, unsafe retry or corrupt restore is HARD_FAIL. Missing evidence/unsupported adapter is NOT_RUN, never PASS.

**RECOVERY:** Reconcile unknown minority attempts after healing.

**EVIDENCE TO CAPTURE:** Run/candidate/version, exact resource IDs/regions/placement, authority epoch, fault start/end, operator/reviewer, strong-read endpoint, intent/result journal, recovered rows/manifest, DB and API latency, cost and cleanup evidence.

## F06 — Quorum loss

Status: NOT_RUN.

**PRECONDITION:** Explicit POC guard and DB marker, exact topology/failure scope, independent durable journal, reviewed fault adapter, safe rollback access; 10,000 ACK baseline. Restore cases require a boundary manifest. No production endpoint or resource.

**ACTION:** Remove enough approved data/control voters or synchronous destinations to prevent safe commits.

**EXPECTED DB BEHAVIOR:** All unsafe authoritative writes stop; never reduce quorum or downgrade sync.

**EXPECTED API BEHAVIOR:** Current API behavior measured separately; POC target distinguishes definite rejection from unknown outcome. No success before qualifying commit.

**EXPECTED WRITE BEHAVIOR:** Only authoritative/quorum side accepts; no minority election by DNS or load balancer. DB and end-to-end observations recorded separately.

**EXPECTED ACK LEDGER:** Every pre-failure ACK present exactly once with matching tenant/hash/value. UNKNOWN_OUTCOME remains separate; reconcile same key. Restore denominator is explicit target-time ledger, with later ACK delta retained.

**PASS CRITERIA:** Zero missing ACKs, zero duplicate/conflicting effects, zero unsafe/minority committed writes; all expected manifest checks pass and unknowns reconcile. Evidence must match declared scope; local simulation cannot qualify region loss.

**FAIL CRITERIA:** Any lost ACK, split brain, minority commit, mismatch, unsafe retry or corrupt restore is HARD_FAIL. Missing evidence/unsupported adapter is NOT_RUN, never PASS.

**RECOVERY:** Restore voters/required remote flush before reopening.

**EVIDENCE TO CAPTURE:** Run/candidate/version, exact resource IDs/regions/placement, authority epoch, fault start/end, operator/reviewer, strong-read endpoint, intent/result journal, recovered rows/manifest, DB and API latency, cost and cleanup evidence.

## F07 — Response loss after commit

Status: NOT_RUN.

**PRECONDITION:** Explicit POC guard and DB marker, exact topology/failure scope, independent durable journal, reviewed fault adapter, safe rollback access; 10,000 ACK baseline. Restore cases require a boundary manifest. No production endpoint or resource.

**ACTION:** Use workload dropEvery=10: commit a transaction, deliberately suppress observed response.

**EXPECTED DB BEHAVIOR:** One durable operation and effect; client records UNKNOWN_OUTCOME.

**EXPECTED API BEHAVIOR:** Current API behavior measured separately; POC target distinguishes definite rejection from unknown outcome. No success before qualifying commit.

**EXPECTED WRITE BEHAVIOR:** Only authoritative/quorum side accepts; no minority election by DNS or load balancer. DB and end-to-end observations recorded separately.

**EXPECTED ACK LEDGER:** Every pre-failure ACK present exactly once with matching tenant/hash/value. UNKNOWN_OUTCOME remains separate; reconcile same key. Restore denominator is explicit target-time ledger, with later ACK delta retained.

**PASS CRITERIA:** Zero missing ACKs, zero duplicate/conflicting effects, zero unsafe/minority committed writes; all expected manifest checks pass and unknowns reconcile. Evidence must match declared scope; local simulation cannot qualify region loss.

**FAIL CRITERIA:** Any lost ACK, split brain, minority commit, mismatch, unsafe retry or corrupt restore is HARD_FAIL. Missing evidence/unsupported adapter is NOT_RUN, never PASS.

**RECOVERY:** Retry exact same tenant/key/hash after authoritative lookup.

**EVIDENCE TO CAPTURE:** Run/candidate/version, exact resource IDs/regions/placement, authority epoch, fault start/end, operator/reviewer, strong-read endpoint, intent/result journal, recovered rows/manifest, DB and API latency, cost and cleanup evidence.

## F08 — Repeated idempotent retry

Status: NOT_RUN.

**PRECONDITION:** Explicit POC guard and DB marker, exact topology/failure scope, independent durable journal, reviewed fault adapter, safe rollback access; 10,000 ACK baseline. Restore cases require a boundary manifest. No production endpoint or resource.

**ACTION:** Retry each F07 key ten times concurrently and sequentially; change payload once.

**EXPECTED DB BEHAVIOR:** Identical key replays one effect; different hash conflicts.

**EXPECTED API BEHAVIOR:** Current API behavior measured separately; POC target distinguishes definite rejection from unknown outcome. No success before qualifying commit.

**EXPECTED WRITE BEHAVIOR:** Only authoritative/quorum side accepts; no minority election by DNS or load balancer. DB and end-to-end observations recorded separately.

**EXPECTED ACK LEDGER:** Every pre-failure ACK present exactly once with matching tenant/hash/value. UNKNOWN_OUTCOME remains separate; reconcile same key. Restore denominator is explicit target-time ledger, with later ACK delta retained.

**PASS CRITERIA:** Zero missing ACKs, zero duplicate/conflicting effects, zero unsafe/minority committed writes; all expected manifest checks pass and unknowns reconcile. Evidence must match declared scope; local simulation cannot qualify region loss.

**FAIL CRITERIA:** Any lost ACK, split brain, minority commit, mismatch, unsafe retry or corrupt restore is HARD_FAIL. Missing evidence/unsupported adapter is NOT_RUN, never PASS.

**RECOVERY:** Retain operation/tombstone and original result.

**EVIDENCE TO CAPTURE:** Run/candidate/version, exact resource IDs/regions/placement, authority epoch, fault start/end, operator/reviewer, strong-read endpoint, intent/result journal, recovered rows/manifest, DB and API latency, cost and cleanup evidence.

## F09 — Node rejoin

Status: NOT_RUN.

**PRECONDITION:** Explicit POC guard and DB marker, exact topology/failure scope, independent durable journal, reviewed fault adapter, safe rollback access; 10,000 ACK baseline. Restore cases require a boundary manifest. No production endpoint or resource.

**ACTION:** Return an out-of-date previously fenced node after majority continued writes.

**EXPECTED DB BEHAVIOR:** Catch-up before eligible voting/serving; no divergent data.

**EXPECTED API BEHAVIOR:** Current API behavior measured separately; POC target distinguishes definite rejection from unknown outcome. No success before qualifying commit.

**EXPECTED WRITE BEHAVIOR:** Only authoritative/quorum side accepts; no minority election by DNS or load balancer. DB and end-to-end observations recorded separately.

**EXPECTED ACK LEDGER:** Every pre-failure ACK present exactly once with matching tenant/hash/value. UNKNOWN_OUTCOME remains separate; reconcile same key. Restore denominator is explicit target-time ledger, with later ACK delta retained.

**PASS CRITERIA:** Zero missing ACKs, zero duplicate/conflicting effects, zero unsafe/minority committed writes; all expected manifest checks pass and unknowns reconcile. Evidence must match declared scope; local simulation cannot qualify region loss.

**FAIL CRITERIA:** Any lost ACK, split brain, minority commit, mismatch, unsafe retry or corrupt restore is HARD_FAIL. Missing evidence/unsupported adapter is NOT_RUN, never PASS.

**RECOVERY:** Wait for stable placement, verify full manifest.

**EVIDENCE TO CAPTURE:** Run/candidate/version, exact resource IDs/regions/placement, authority epoch, fault start/end, operator/reviewer, strong-read endpoint, intent/result journal, recovered rows/manifest, DB and API latency, cost and cleanup evidence.

## F10 — Failback

Status: NOT_RUN.

**PRECONDITION:** Explicit POC guard and DB marker, exact topology/failure scope, independent durable journal, reviewed fault adapter, safe rollback access; 10,000 ACK baseline. Restore cases require a boundary manifest. No production endpoint or resource.

**ACTION:** After F09, perform only vendor-supported planned leadership transfer with old authority fenced.

**EXPECTED DB BEHAVIOR:** No stale DNS rollback or independent leader; correct strong reads.

**EXPECTED API BEHAVIOR:** Current API behavior measured separately; POC target distinguishes definite rejection from unknown outcome. No success before qualifying commit.

**EXPECTED WRITE BEHAVIOR:** Only authoritative/quorum side accepts; no minority election by DNS or load balancer. DB and end-to-end observations recorded separately.

**EXPECTED ACK LEDGER:** Every pre-failure ACK present exactly once with matching tenant/hash/value. UNKNOWN_OUTCOME remains separate; reconcile same key. Restore denominator is explicit target-time ledger, with later ACK delta retained.

**PASS CRITERIA:** Zero missing ACKs, zero duplicate/conflicting effects, zero unsafe/minority committed writes; all expected manifest checks pass and unknowns reconcile. Evidence must match declared scope; local simulation cannot qualify region loss.

**FAIL CRITERIA:** Any lost ACK, split brain, minority commit, mismatch, unsafe retry or corrupt restore is HARD_FAIL. Missing evidence/unsupported adapter is NOT_RUN, never PASS.

**RECOVERY:** Abort failback and retain proven current authority if unsafe.

**EVIDENCE TO CAPTURE:** Run/candidate/version, exact resource IDs/regions/placement, authority epoch, fault start/end, operator/reviewer, strong-read endpoint, intent/result journal, recovered rows/manifest, DB and API latency, cost and cleanup evidence.

## F11 — Snapshot restore

Status: NOT_RUN.

**PRECONDITION:** Explicit POC guard and DB marker, exact topology/failure scope, independent durable journal, reviewed fault adapter, safe rollback access; 10,000 ACK baseline. Restore cases require a boundary manifest. No production endpoint or resource.

**ACTION:** Restore a coordinated synthetic snapshot into a NEW isolated marked target.

**EXPECTED DB BEHAVIOR:** Consistent schema, tenant graph, exact Finance/evidence/audit manifest at snapshot boundary.

**EXPECTED API BEHAVIOR:** Current API behavior measured separately; POC target distinguishes definite rejection from unknown outcome. No success before qualifying commit.

**EXPECTED WRITE BEHAVIOR:** Only authoritative/quorum side accepts; no minority election by DNS or load balancer. DB and end-to-end observations recorded separately.

**EXPECTED ACK LEDGER:** Every pre-failure ACK present exactly once with matching tenant/hash/value. UNKNOWN_OUTCOME remains separate; reconcile same key. Restore denominator is explicit target-time ledger, with later ACK delta retained.

**PASS CRITERIA:** Zero missing ACKs, zero duplicate/conflicting effects, zero unsafe/minority committed writes; all expected manifest checks pass and unknowns reconcile. Evidence must match declared scope; local simulation cannot qualify region loss.

**FAIL CRITERIA:** Any lost ACK, split brain, minority commit, mismatch, unsafe retry or corrupt restore is HARD_FAIL. Missing evidence/unsupported adapter is NOT_RUN, never PASS.

**RECOVERY:** Compare expected boundary manifest and ledger; retain source.

**EVIDENCE TO CAPTURE:** Run/candidate/version, exact resource IDs/regions/placement, authority epoch, fault start/end, operator/reviewer, strong-read endpoint, intent/result journal, recovered rows/manifest, DB and API latency, cost and cleanup evidence.

## F12 — PITR/equivalent restore

Status: NOT_RUN.

**PRECONDITION:** Explicit POC guard and DB marker, exact topology/failure scope, independent durable journal, reviewed fault adapter, safe rollback access; 10,000 ACK baseline. Restore cases require a boundary manifest. No production endpoint or resource.

**ACTION:** Restore to declared target timestamp just before synthetic corruption using retained WAL/equivalent.

**EXPECTED DB BEHAVIOR:** Reconstructed point-in-time state matches boundary; later valid ACKs accounted separately.

**EXPECTED API BEHAVIOR:** Current API behavior measured separately; POC target distinguishes definite rejection from unknown outcome. No success before qualifying commit.

**EXPECTED WRITE BEHAVIOR:** Only authoritative/quorum side accepts; no minority election by DNS or load balancer. DB and end-to-end observations recorded separately.

**EXPECTED ACK LEDGER:** Every pre-failure ACK present exactly once with matching tenant/hash/value. UNKNOWN_OUTCOME remains separate; reconcile same key. Restore denominator is explicit target-time ledger, with later ACK delta retained.

**PASS CRITERIA:** Zero missing ACKs, zero duplicate/conflicting effects, zero unsafe/minority committed writes; all expected manifest checks pass and unknowns reconcile. Evidence must match declared scope; local simulation cannot qualify region loss.

**FAIL CRITERIA:** Any lost ACK, split brain, minority commit, mismatch, unsafe retry or corrupt restore is HARD_FAIL. Missing evidence/unsupported adapter is NOT_RUN, never PASS.

**RECOVERY:** Reconcile reviewed post-target operations before hypothetical cutover.

**EVIDENCE TO CAPTURE:** Run/candidate/version, exact resource IDs/regions/placement, authority epoch, fault start/end, operator/reviewer, strong-read endpoint, intent/result journal, recovered rows/manifest, DB and API latency, cost and cleanup evidence.

## F13 — Logical corruption recovery

Status: NOT_RUN.

**PRECONDITION:** Explicit POC guard and DB marker, exact topology/failure scope, independent durable journal, reviewed fault adapter, safe rollback access; 10,000 ACK baseline. Restore cases require a boundary manifest. No production endpoint or resource.

**ACTION:** On a disposable copy only, alter/delete labelled synthetic rows then recover an earlier trusted boundary.

**EXPECTED DB BEHAVIOR:** Corruption is detected; independent backup restores exact tenant/value/link history.

**EXPECTED API BEHAVIOR:** Current API behavior measured separately; POC target distinguishes definite rejection from unknown outcome. No success before qualifying commit.

**EXPECTED WRITE BEHAVIOR:** Only authoritative/quorum side accepts; no minority election by DNS or load balancer. DB and end-to-end observations recorded separately.

**EXPECTED ACK LEDGER:** Every pre-failure ACK present exactly once with matching tenant/hash/value. UNKNOWN_OUTCOME remains separate; reconcile same key. Restore denominator is explicit target-time ledger, with later ACK delta retained.

**PASS CRITERIA:** Zero missing ACKs, zero duplicate/conflicting effects, zero unsafe/minority committed writes; all expected manifest checks pass and unknowns reconcile. Evidence must match declared scope; local simulation cannot qualify region loss.

**FAIL CRITERIA:** Any lost ACK, split brain, minority commit, mismatch, unsafe retry or corrupt restore is HARD_FAIL. Missing evidence/unsupported adapter is NOT_RUN, never PASS.

**RECOVERY:** Preserve original reference and corrupt-copy evidence; no customer cutover.

**EVIDENCE TO CAPTURE:** Run/candidate/version, exact resource IDs/regions/placement, authority epoch, fault start/end, operator/reviewer, strong-read endpoint, intent/result journal, recovered rows/manifest, DB and API latency, cost and cleanup evidence.

## Pass and disqualification rule

Missing acknowledged writes, unsafe minority commits or divergent histories are hard failures and disqualify the candidate for the declared RPO-0 model. Unsupported adapters or incomplete evidence are NOT_RUN/NOT_QUALIFIED, never PASS. Logical corruption and a historical PITR boundary are different from single-region survival; a snapshot comparison cannot erase valid later ACKs. See the [scorecard](database-poc-scorecard.md), [BOM](database-poc-bom.md) and [teardown controls](database-poc-teardown.md).
