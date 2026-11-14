# Production implementation backlog

Status: LP-PROD-001 repository evidence and POC preparation COMPLETE; provider evidence DEFERRED under the user's repository-only scope. Other architecture implementation tickets remain NOT_STARTED. Earlier feature implementation is reused, not restarted. Tickets require separate authorization for paid provisioning, production changes, migrations and provider actions. Owner roles: platform/SRE (infrastructure/recovery), backend (durability/tenant/Finance), mobile (offline), security and product (review). Assign named assignees before scheduling.

LP-PROD-004 and 006 are sequenced with the operation registry foundation first; the full mutation adoption can then complete alongside readiness. Final 006 acceptance precedes 004 final acceptance. No circular schema dependency is required.

## LP-PROD-001 — Evidence, failure model and managed-service qualification

Status: repository deliverables COMPLETE; full provider/ownership qualification remains incomplete. [Evidence report](lp-prod-001-report.md) records exact unknowns and closure requests. No provider access, configuration changes, database sessions or provisioning occurred. No production release gate passed by this documentation milestone.

- **TITLE:** Evidence, failure model and managed-service qualification
- **PRIORITY:** P0
- **PROBLEM:** No verified inventory proves production guarantees.
- **SCOPE:** Record hosting/DB/storage/auth regions, runtime privileges, backup retention/keys, current dataset sizes, named owners, support plan and budget. Qualify managed strict-sync versus distributed offerings; document single-region failure boundary.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** None.
- **IMPLEMENTATION NOTES:** Read-only operator evidence only under separate authorization; redact credentials and customer contents.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Every external unknown has owner and evidence request; reject async-only RPO claims; approve POC budget/scope. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Every external unknown has owner and evidence request; reject async-only RPO claims; approve POC budget/scope. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** No service changes; retain existing Render environment.
- **DOCUMENTATION:** [Design](production-architecture.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-002 — Real-schema database durability POC

Status: PREPARATION VALIDATED / LIVE EXECUTION NOT_STARTED. LP-PROD-002A delivered the [harness and preparation report](lp-prod-002a-report.md), [BOM](database-poc-bom.md), [failure matrix](database-poc-failure-matrix.md), [scorecard](database-poc-scorecard.md) and [teardown plan](database-poc-teardown.md). Remaining pre-execution integration includes Cockroach's reviewed equivalent connector/baseline, complete real-API latency bindings and provider-specific fault/restore controls. Use the [bounded database plan](database-poc-plan.md) and [object plan](object-storage-poc-plan.md). Owner-authorized budget boundary: $150 USD aggregate and 72 hours from first paid resource creation, not permission to provision. LP-PROD-002B paid work requires verified full quotes/feasibility, image/support/license pins, named operator/cleanup reviewer and explicit authorization. Prefer local/free valid evidence; stop before any portion that would exceed the cap. Local tooling tests do not satisfy regional RPO-0 qualification.

- **TITLE:** Real-schema database durability POC
- **PRIORITY:** P0
- **PROBLEM:** SQL compatibility and regional commit behavior are unproven.
- **SCOPE:** Compare strict synchronous PostgreSQL, Cockroach region survival and Yugabyte synchronous YSQL using all current schema constraints and real regression suite; benchmark/restore/partition.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 001.
- **IMPLEMENTATION NOTES:** Use isolated synthetic targets, pinned versions and independent ACK ledger; do not weaken locks/triggers or use ambient DB URL.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** All ACKs survive each single-region failure; duplicate/tenant/Finance constraints hold; adapter, retry, RTO and cost evidence reviewed; ADR selected only after PASS. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** All ACKs survive each single-region failure; duplicate/tenant/Finance constraints hold; adapter, retry, RTO and cost evidence reviewed; ADR selected only after PASS. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Discard only approved POC targets; production stays unchanged.
- **DOCUMENTATION:** [Design](database-evaluation.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-003 — Multi-site foundation and global routing

- **TITLE:** Multi-site foundation and global routing
- **PRIORITY:** P0
- **PROBLEM:** A single reference hosting site cannot survive regional failure.
- **SCOPE:** Implement approved IaC networks, A/B stateless capacity, C data/control role, private origins, secrets, edge/WAF/quotas and qualified DB topology.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 001,002.
- **IMPLEMENTATION NOTES:** Separate environments and recovery administration; provider modules after selection, no Kubernetes default.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** One-site load test passes launch peak, automatic route removal/rejoin demonstrated, topology and secrets isolation audited. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** One-site load test passes launch peak, automatic route removal/rejoin demonstrated, topology and secrets isolation audited. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Revert target-only IaC before live data; after live use fenced failover, never destructive state removal.
- **DOCUMENTATION:** [Design](multi-region.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-004 — Write-readiness, fencing and unknown outcomes

- **TITLE:** Write-readiness, fencing and unknown outcomes
- **PRIORITY:** P0
- **PROBLEM:** Current health only proves process/DB connectivity.
- **SCOPE:** Implement health endpoints, durable policy epoch, per-class write gate across APIs/workers, state machine, honest rejected/unknown responses and scoped operation lookup.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 002,003,006.
- **IMPLEMENTATION NOTES:** Enforce at actual commit boundary and non-bypassable DB/storage policy; validate stale leases and hidden GET mutations.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Partition/stale health/timeout tests show no false ACK, no minority write, protected reads remain safe and unknown results reconcile. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Partition/stale health/timeout tests show no false ACK, no minority write, protected reads remain safe and unknown results reconcile. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Keep READ_ONLY if uncertain; revert implementation only while fenced and API compatible.
- **DOCUMENTATION:** [Design](data-durability.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-005 — Regional immutable evidence and signature receipts

- **TITLE:** Regional immutable evidence and signature receipts
- **PRIORITY:** P0
- **PROBLEM:** Files exist on local volume without redundant storage receipts.
- **SCOPE:** Implement two-of-three regional storage receipts, quarantine/magic/malware checks, upload saga/reconciliation, immutable metadata and exact signature document checksum snapshot.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 002,003,006.
- **IMPLEMENTATION NOTES:** Preserve existing versions and hashes, no in-place overwrite; short DB finalization transactions; private exact-version downloads.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Every ACK has two valid regional receipts and quorum metadata; all partial failure/retry/restore/signature/grant cases pass. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Every ACK has two valid regional receipts and quorum metadata; all partial failure/retry/restore/signature/grant cases pass. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Keep legacy source read-only; reconcile target ACKs before rollback, retain uncertain artifacts.
- **DOCUMENTATION:** [Design](object-storage.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-006 — Shared durable idempotency and mutation adoption

- **TITLE:** Shared durable idempotency and mutation adoption
- **PRIORITY:** P0
- **PROBLEM:** Not every mutation has stable replay semantics.
- **SCOPE:** Implement operation registry, hash/tenant/actor scope, status/replay/conflict handling and tombstone retention; adopt all mutation families in audit.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 002.
- **IMPLEMENTATION NOTES:** Coordinate schema/service/client rollout; preserve existing payment/signature/import keys and reauthorize replays.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** All mutation families pass concurrent/lost-ACK/restart/hash-conflict/role-revocation tests with one durable effect. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** All mutation families pass concurrent/lost-ACK/restart/hash-conflict/role-revocation tests with one durable effect. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Compatible expand schema retained; stop rollout without deleting dedup records.
- **DOCUMENTATION:** [Design](mutation-audit.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-007 — Transactional outbox, inbox and retry workers

- **TITLE:** Transactional outbox, inbox and retry workers
- **PRIORITY:** P0
- **PROBLEM:** Provider I/O in transactions can escape rollback; no durable jobs.
- **SCOPE:** Commit required event/audit with business; implement polling workers, fencing leases, durable failed state, inbox/provider dedup and invitation reconciliation.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 002,006.
- **IMPLEMENTATION NOTES:** Refactor external I/O out of retryable DB callbacks; at-least-once with explicit ambiguous provider outcomes.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Crash/duplicate/lease/replay/email-outage tests preserve intent; no duplicate authoritative effects or false delivery success. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Crash/duplicate/lease/replay/email-outage tests preserve intent; no duplicate authoritative effects or false delivery success. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Pause workers; retain and replay committed outbox safely after compatible rollback.
- **DOCUMENTATION:** [Design](data-durability.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-008 — Tenant and runtime privilege hardening

- **TITLE:** Tenant and runtime privilege hardening
- **PRIORITY:** P0
- **PROBLEM:** Legacy ID-only relations and privileged DB access lack defense in depth.
- **SCOPE:** Review every model/route, add tenant composite constraints and runtime RLS/context where supported; narrow bootstrap, worker/support/export roles; revoke unsafe direct access.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 002,006.
- **IMPLEMENTATION NOTES:** Audit existing mismatches and quarantine for review before constraints; no silent organization reassignment.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Cross-tenant/same-tenant wrong-Driver tests, direct FK/RLS/pool leakage and revoked grant replay all fail safely. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Cross-tenant/same-tenant wrong-Driver tests, direct FK/RLS/pool leakage and revoked grant replay all fail safely. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Retain security constraints; deploy compatible API or stay fenced instead of reopening broad grants.
- **DOCUMENTATION:** [Design](multi-tenancy.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-009 — Independent backups, PITR and key recovery

- **TITLE:** Independent backups, PITR and key recovery
- **PRIORITY:** P0
- **PROBLEM:** Backup existence and restoration are unproven.
- **SCOPE:** Implement continuous recovery chain, snapshots, independent immutable account, object manifests/version retention, recovery keys and weekly isolated drill automation.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 002,003,005.
- **IMPLEMENTATION NOTES:** Production identity cannot destroy archives; counsel approves retention/holds; no normal dev copy of customer data.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Full restored metadata/object/Finance/signature/tenant validation plus key-loss exercise and measured RPO/RTO pass. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Full restored metadata/object/Finance/signature/tenant validation plus key-loss exercise and measured RPO/RTO pass. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Preserve existing backups; disable new scheduler only after verified alternative recovery, never purge sole copies.
- **DOCUMENTATION:** [Design](backup-and-recovery.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-010 — Telemetry, write safety alerts and on-call

- **TITLE:** Telemetry, write safety alerts and on-call
- **PRIORITY:** P0
- **PROBLEM:** No implemented correlation/paging proves failures are detected.
- **SCOPE:** Add OTel-compatible traces/metrics/redaction, dependency and evidence dashboards, safe synthetic tenant, alert severities and real escalation contacts.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 003,004,005,007.
- **IMPLEMENTATION NOTES:** Redact tokens/files/financial payloads at source; durable audit separate from sampled logs; external monitoring account.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Injected quorum/object/auth/backup/outbox errors trigger correct pages; harmless transients do not; pager delivery/ack and redaction verified. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Injected quorum/object/auth/backup/outbox errors trigger correct pages; harmless transients do not; pager delivery/ack and redaction verified. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Roll back faulty collector/config without disabling durable audit or safety alarms; retain fallback page path.
- **DOCUMENTATION:** [Design](observability.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-011 — Durable Driver offline queue

- **TITLE:** Durable Driver offline queue
- **PRIORITY:** P0
- **PROBLEM:** Pending evidence and mutations are memory-bound.
- **SCOPE:** Persist encrypted tenant-bound operations/files, lifecycle states, reconnect/restart reconciliation and conflict UI using same server key.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 004,005,006.
- **IMPLEMENTATION NOTES:** No account-crossing replay or silent pending deletion; no new permission scope beyond explicit review.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Kill/reboot/airplane/disk-full/duplicate/stale signature/account-switch tests pass; never show submitted before server confirmation. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Kill/reboot/airplane/disk-full/duplicate/stale signature/account-switch tests pass; never show submitted before server confirmation. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Backward-compatible queue versioning; drain or retain pending operations, never erase queue on downgrade.
- **DOCUMENTATION:** [Design](mobile-offline.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-012 — Failover, restoration and incident qualification

- **TITLE:** Failover, restoration and incident qualification
- **PRIORITY:** P0
- **PROBLEM:** Targets have no objective timed evidence.
- **SCOPE:** Execute regional/DB/partition/storage/backup/PITR/credential/bad-release drills with ACK ledger and all runbook sections; qualify warm DR and cold recovery limits.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 003,004,005,007,008,009,010,013,015.
- **IMPLEMENTATION NOTES:** Synthetic chaos only on approved targets; real backup drill needs production-security-class isolation and approval.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Every applicable gate PASS with digest/topology/time/operator/reviewer; zero lost ACKs, no forced quorum downgrade, safe <60s serving and qualified DR target. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Every applicable gate PASS with digest/topology/time/operator/reviewer; zero lost ACKs, no forced quorum downgrade, safe <60s serving and qualified DR target. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Revert approved chaos faults, keep writes fenced until integrity verified; production not a test target.
- **DOCUMENTATION:** [Design](test-strategy.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-013 — Immutable CI/CD and controlled migrations

- **TITLE:** Immutable CI/CD and controlled migrations
- **PRIORITY:** P0
- **PROBLEM:** Local scripts are not a protected deployment pipeline.
- **SCOPE:** Implement PR gates, artifact signing/scanning/SBOM, same-byte promotion solution for Next config, staging, migration approval, canary and rollback.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 002,003.
- **IMPLEMENTATION NOTES:** No production secrets in build; no startup/laptop migration; retain original migrations and compatible old clients.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Artifact digests identical across sites and approved promotion; bad canary stops; migration/rollback rehearsed; negative tenant/security tests mandatory. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Artifact digests identical across sites and approved promotion; bad canary stops; migration/rollback rehearsed; negative tenant/security tests mandatory. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Redeploy prior compatible digest; no destructive down-migration or loss of new outbox state.
- **DOCUMENTATION:** [Design](deployment.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-014 — Minimum customer lifecycle and privileged support controls

- **TITLE:** Minimum customer lifecycle and privileged support controls
- **PRIORITY:** P0
- **PROBLEM:** Export/closure/retention/support access is not safely formalized.
- **SCOPE:** Implement approved retention/hold/deletion ledger, scoped export/recovery, minimum redacted support view, reason/expiry/MFA/audit and privacy/support documentation.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 005,008,009,010.
- **IMPLEMENTATION NOTES:** Counsel sets policy; no unrestricted SQL/bucket access or automatic organization cascade deletion.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Owner/tenant-negative export tests, hold/deletion/backup restore replay and time-limited support access pass; contacts and policies approved. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Owner/tenant-negative export tests, hold/deletion/backup restore replay and time-limited support access pass; contacts and policies approved. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Pause destructive jobs; retain audit/hold records and use manual approved scoped support.
- **DOCUMENTATION:** [Design](customer-data-lifecycle.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-015 — Capacity, admission and cost qualification

- **TITLE:** Capacity, admission and cost qualification
- **PRIORITY:** P0
- **PROBLEM:** No measured N-1 capacity or recoverable dataset budget.
- **SCOPE:** Measure workload bands, largest-tenant load, upload/Finance conflicts, reconnect bursts, 24h soak, quotas, recovery throughput and dated cost model.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 002,003,005,007,010.
- **IMPLEMENTATION NOTES:** Use synthetic data, budget guardrails and fair tenant admission without compromising durability.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Twice expected peak and single-site capacity pass agreed latency budgets; restore size and cost signed off; no correctness or unbounded resource failures. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Twice expected peak and single-site capacity pass agreed latency budgets; restore size and cost signed off; no correctness or unbounded resource failures. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Reduce admission/launch scope with truthful pending responses, not weaker commit/storage guarantees.
- **DOCUMENTATION:** [Design](capacity-planning.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-016 — Rehearsed Render migration and rollback

- **TITLE:** Rehearsed Render migration and rollback
- **PRIORITY:** P0
- **PROBLEM:** Cutover without reconciling later writes risks customer loss.
- **SCOPE:** Build approved copy/CDC, full evidence checksum reconciliation, shadow reads, final fence/delta boundary, target cutover and post-write rollback/forward-repair protocol.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 002,004,005,006,007,008,009,012,013,014,023.
- **IMPLEMENTATION NOTES:** Do not execute production migration under architecture ticket; preserve source and all identity mappings.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Rehearsal reconciles every ACK/row/evidence version; missing file blocks; rollback after target write cannot lose target delta; freeze duration measured. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Rehearsal reconciles every ACK/row/evidence version; missing file blocks; rollback after target write cannot lose target delta; freeze duration measured. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Before target ACK revert safely; afterwards fence/reconcile reverse delta or repair forward, never route to stale source.
- **DOCUMENTATION:** [Design](deployment.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-017 — Controlled real-customer launch review

- **TITLE:** Controlled real-customer launch review
- **PRIORITY:** P0
- **PROBLEM:** Application tests alone do not establish data-safety readiness.
- **SCOPE:** Collect all release-gate evidence, independent security review, runbook/contact sign-off, approved customer cohort and monitored rollback plan.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 001 through 016,023.
- **IMPLEMENTATION NOTES:** No P0 waivers hidden in launch report; named accountable owner and privacy/product consent.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Every P0 gate current PASS, no unknown authority/backups/tenant risks, explicit launch approval and customer support readiness. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Every P0 gate current PASS, no unknown authority/backups/tenant risks, explicit launch approval and customer support readiness. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Pause new onboarding and unsafe writes; preserve all accepted state and incident recovery path.
- **DOCUMENTATION:** [Design](release-gates.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-018 — Organization billing abstraction

- **TITLE:** Organization billing abstraction
- **PRIORITY:** P1
- **PROBLEM:** Future carrier subscription billing is distinct from Driver Pro.
- **SCOPE:** Define server-side billing provider interface and signed inbox/reconciliation contract; integrate a provider only with separate product approval.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 006,007,008,014.
- **IMPLEMENTATION NOTES:** No coupling to free POD/workflow availability or RevenueCat identity; no arbitrary payment replay.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Provider outage and duplicate webhook do not block core logistics or duplicate billing; subscription ownership scoped. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Provider outage and duplicate webhook do not block core logistics or duplicate billing; subscription ownership scoped. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Disable organization billing integration without losing durable webhook/financial records.
- **DOCUMENTATION:** [Design](production-architecture.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-019 — Derived analytics and search expansion

- **TITLE:** Derived analytics and search expansion
- **PRIORITY:** P2
- **PROBLEM:** Heavy reporting may eventually compete with logistics SQL.
- **SCOPE:** Measure query costs first; only if justified build rebuildable SQL replicas/index/analytics pipeline from durable snapshots/outbox.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 007,008,015.
- **IMPLEMENTATION NOTES:** No new warehouse/search cluster by default; preserve tenant filters and source authority.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Destroy/rebuild derived store without losing any business record; freshness and isolation visible. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Destroy/rebuild derived store without losing any business record; freshness and isolation visible. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Route bounded queries back to SQL or disable derived feature safely.
- **DOCUMENTATION:** [Design](capacity-planning.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-020 — Role normalization and integration boundary cleanup

- **TITLE:** Role normalization and integration boundary cleanup
- **PRIORITY:** P1
- **PROBLEM:** ADMIN/ACCOUNTANT/READ_ONLY are proposals, and providerEnvelopeId lives in core agreement data.
- **SCOPE:** Product-approved capability mapping from BACK_OFFICE; separate provider mapping with backward compatibility, no automatic privilege expansion.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 008,014.
- **IMPLEMENTATION NOTES:** Sensitive payroll/Driver access remains explicit; data migration preserves agreement audit/evidence.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Complete role matrix negatives and provider outage tests; existing users gain no implicit authority. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Complete role matrix negatives and provider outage tests; existing users gain no implicit authority. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Retain old mapping/enum compatibility until clients and data transition verified.
- **DOCUMENTATION:** [Design](multi-tenancy.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-021 — Support workflow automation and status communications

- **TITLE:** Support workflow automation and status communications
- **PRIORITY:** P1
- **PROBLEM:** Minimum safe support will need operational efficiency as customers grow.
- **SCOPE:** Add audited diagnostics packaging, tenant-scoped support case workflow and customer-safe status updates.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 010,014.
- **IMPLEMENTATION NOTES:** No unrestricted impersonation or attachment of customer documents/secrets to external tickets.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Access expiry/reason checks, redaction and wrong-tenant tests; incident messages distinguish unknown outcomes. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Access expiry/reason checks, redaction and wrong-tenant tests; incident messages distinguish unknown outcomes. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Return to approved manual minimum support without dropping access/audit constraints.
- **DOCUMENTATION:** [Design](security.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-022 — Cache and worker performance optimization

- **TITLE:** Cache and worker performance optimization
- **PRIORITY:** P2
- **PROBLEM:** Load growth may exceed simple polling/local caches.
- **SCOPE:** Measure SQL/outbox pressure; add execution hints or regional cache only where justified and rebuildable.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 007,015.
- **IMPLEMENTATION NOTES:** Redis never holds sole critical event or authorization authority; no default Kafka migration.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Delete cache/queue and recover from SQL without loss or duplicate effect; quotas/latency improve measurably. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Delete cache/queue and recover from SQL without loss or duplicate effect; quotas/latency improve measurably. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Disable optimization and resume SQL-backed execution preserving dedup state.
- **DOCUMENTATION:** [Design](capacity-planning.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).

## LP-PROD-023 — Finance and evidence history invariants

- **TITLE:** Finance and evidence history invariants
- **PRIORITY:** P0
- **PROBLEM:** Selected UPDATE triggers do not prove complete immutable history, and historical currency is implicit.
- **SCOPE:** Review delete/cascade/grant policy, explicit historical currency/provenance, correction/reversal audit, exact Decimal aggregates, version immutability and signature checksum binding.
- **OUT OF SCOPE:** Unrelated UI/domain redesign, provider actions not explicitly authorized for this ticket, production resets, silent data repair and reduced durability.
- **DEPENDENCIES:** 002,005,006,008.
- **IMPLEMENTATION NOTES:** No general ledger/payroll execution/tax advice; historical currency backfill requires verified provenance, not guessed FX.
- **SECURITY CONSIDERATIONS:** Least privilege, tenant/actor validation and secret-redacted evidence are mandatory; security reviewer signs off changed trust boundaries.
- **DATA SAFETY CONSIDERATIONS:** Preserve acknowledged records, immutable evidence and audit; fence uncertain outcomes, retain recoverable before-state and dedup keys. No customer-data test fixtures.
- **TEST PLAN:** Direct UPDATE/DELETE unauthorized tests, concurrency/import reversal/payment replay and exact totals pass; every signature resolves unchanged original checksum. Attach reproducible run IDs, versions/configuration, expected/actual results and independent reviewer. Use [test strategy](test-strategy.md).
- **ACCEPTANCE CRITERIA:** Direct UPDATE/DELETE unauthorized tests, concurrency/import reversal/payment replay and exact totals pass; every signature resolves unchanged original checksum. No unresolved P0 correctness finding; documentation and runbooks updated.
- **ROLLBACK:** Preserve evidence and correction history; use reviewed forward correction, never destructive historical rewrite.
- **DOCUMENTATION:** [Design](data-durability.md) and relevant ADR/runbook; attach final evidence to [release gates](release-gates.md).
