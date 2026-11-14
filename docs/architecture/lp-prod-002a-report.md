# LP-PROD-002A DATABASE POC PREPARATION REPORT

Date: 2026-10-02. Scope: isolated repository tooling, synthetic fixtures, documentation and safe local validation. **Preparation package delivered; candidate execution and paid authorization remain blocked.** No winner selected.

## 1. EXECUTIVE SUMMARY

The guarded [POC harness](database-poc-harness.md) is implemented under `scripts/poc`, with real schema/migration inventory, synthetic fixtures, independent ACK journal/reconciliation, POC idempotency, transaction probes, SQL latency probes and restore comparison. The [BOM](database-poc-bom.md), [13-scenario matrix](database-poc-failure-matrix.md), [hard scorecard](database-poc-scorecard.md) and [teardown plan](database-poc-teardown.md) define later execution. Local checks pass; no live database or regional durability claim is made. Exact official pricing, account-specific image/identity details, full API benchmark bindings, candidate compatibility and live fault controls remain pre-execution work.

## 2. SAFETY CONFIRMATION

Production changes: **NONE**. Production DB connections: **NONE**. Production migrations: **NONE**. Customer-data changes: **NONE**. Provider changes: **NONE**. Paid resources created: **NONE**. Cloud spend: **$0**. Git commit/push: **NONE**.

No database connection or migration of any kind was executed in 002A. No provider dashboard was opened. Public official release/pricing documentation was read without provider account access. Existing dirty workspace changes were preserved. No normal `.env`, production credential or customer-data fixture was copied into the harness workspace. Source application code, lockfile, dependencies, workflows, DNS, Render, Supabase, RevenueCat and all production release gates remain unchanged by this ticket.

## 3. HARNESS CREATED

See [README](../../scripts/poc/README.md). Explicit POC environment, candidate/run ID, dedicated database/user/port and actual database nonce marker prevent ordinary target reuse. Bootstrap refuses nonempty databases. Commands cover offline plan/prepare/cleanup-plan and future guarded schema, fixture, transaction, application, workload, reconciliation, latency and snapshot work. No cloud create/delete executor exists.

## 4. SYNTHETIC DATA MODEL

Deterministic two-tenant fixtures cover all 26 models. Fictional owners/admin persona, dispatchers, back office and drivers link loads/stops, RateCon/BOL/POD metadata, versions, signatures, agreements, Finance/imports/history, invitations and audits. OWNER represents the administrative persona because ADMIN is not an actual enum. UUIDs/checksums/timestamps are deterministic; money is exact decimal text. Actual object bytes are outside this DB POC.

## 5. SCHEMA QUALIFICATION

Source inventory confirms **26 models, 26 enums, 17 migrations**, retaining full declarations/SQL and hashes. Isolated Prisma validate and generate passed without connecting. Live migration/catalog/semantic checks are NOT_RUN. Prepared checks cover required scalar types, constraints, tenant FKs, cascades/restricts, raw SQL, Finance view, triggers, PL/pgSQL-dependent behavior, locks, normalized/partial indexes and Supabase role prerequisites. Catalog capture is not complete semantic equivalence; source upgrade/backfill, privilege and edge-case tests remain part of candidate qualification.

## 6. APPLICATION TEST INTEGRATION

An isolated API/contracts copy reuses resolved installed dependency packages. A Windows/pnpm parent-junction problem was found during rehearsal and corrected by linking each resolved package. Copied Finance/signature guards point only at the dedicated POC target; production tests remain unchanged. The isolated API typecheck passed with access to dependency declarations denied by the initial filesystem sandbox.

Prepared command groups cover API lint/build/unit/HTTP, Finance, signatures, stop-event concurrency, payments and company/driver tests. Full API suites were not rerun in this preparation ticket; live candidate integration is NOT_RUN. Mocked HTTP results must remain separate from real database evidence. Cockroach's current connector/migration incompatibility is explicitly blocked; no silent production rewrite is included.

## 7. ACK LEDGER DESIGN

WRITE-000001 through WRITE-010000, independent fsynced client intent/result journal, separate authoritative operation/effect state and exact same-key payload identities. Reconciliation reports attempted, acknowledged, rejected, unknown, present after recovery, missing acknowledged, duplicate authoritative records and completeness/mismatch details. Lost ACKs are HARD_FAIL. The 10,000-record unit simulation passed; actual database/failure-domain evidence is NOT_RUN.

## 8. IDEMPOTENCY / UNKNOWN-OUTCOME TEST

The POC registry commits one operation and effect atomically. Deliberate response suppression preserves UNKNOWN_OUTCOME; same-key retry reconciles the effect. `retry-stress` prepares ten sequential plus ten concurrent replays per original unknown and a changed-payload rejection. Unresolved intents remain unknown, never rejected. Unit simulations/retry-code tests pass; live SQL stress is NOT_RUN. **CURRENT APPLICATION CAPABILITY lacks universal idempotency; POC/TARGET CAPABILITY does not mark its production gate PASS.**

## 9. FAILURE MATRIX

All F01–F13 definitions validate, each with precondition, action, expected DB/API/write/ledger behavior, pass/fail criteria, recovery and evidence. Node/leader/region loss, partition/minority/quorum loss, response loss/retry, rejoin/failback, snapshot/PITR/corruption recovery are covered. Live destructive scenarios are NOT_RUN. Provider adapters remain subject to exact-resource allowlist and cleanup review.

## 10. SPLIT-BRAIN TEST

F04–F06/F09/F10 require majority/authoritative-only commits, no minority authority through DNS/load balancing, safe old-writer fencing and one history after rejoin. For PostgreSQL, DCS quorum cannot replace eligible remote WAL durability. Inability to prove this disqualifies the candidate for the declared RPO-0 architecture. No split-brain proof has yet been produced.

## 11. RESTORE TEST

Snapshot captures full-row hashes/counts for all 26 tables plus operation/effect ledger in a consistent transaction. Restored tenant ownership, loads/stops, Finance, document metadata/versions/signatures and audits must match the declared boundary. PITR/corruption cases preserve later valid ACK deltas separately. Comparison code is prepared; live backup/restore is NOT_RUN. Object bytes are OUT_OF_SCOPE.

## 12. LATENCY TEST

Eight actual-table SQL probe workloads and a reusable eight-callback API measurement runner are prepared. Reporting separates DB/API and phase, excludes warmups, retains failures, and computes p50/p95/p99 with counts. The reporting/runner unit tests pass. Real timings are NOT_RUN. Full endpoint/fixture bindings for the eight real API workloads must be completed in the isolated Nest test setup before the paid trial; the documented mapping is not misrepresented as executable endpoint coverage or measured performance.

## 13. TRACK A BILL OF MATERIALS

AWS A/B/C: PostgreSQL 17.11 on three m6i.xlarge data nodes with Patroni 4.1.4, plus three m6i.large etcd 3.6.14 voters. Data node storage 16+100 GiB gp3; DCS 8 GiB each; source 12h. Restore: one matching data node in D for up to 4h. Strict sync/fencing/settings and supported operation require qualification. See the [complete BOM](database-poc-bom.md).

## 14. TRACK B BILL OF MATERIALS

CockroachDB 26.2.7, five m6i.xlarge data nodes in A/B/C placement 2/2/1, 116 GiB gp3 each, source 12h. Restore five matching nodes in D for up to 4h. Region-survival placement, connector/baseline, license and support require verification. No separate DCS.

## 15. TRACK C BILL OF MATERIALS

YugabyteDB 2025.2.6.0-b111, three m6i.xlarge co-located master/tserver nodes, one per A/B/C, 116 GiB gp3 each, source 12h. Restore three matching nodes in D for up to 4h. This is functional POC sizing; production capacity and supported operation remain unqualified.

## 16. PRICING STATUS

**PRICE_REQUIRES_VERIFICATION.** Official pricing sources are linked in the BOM; a complete dated region/SKU quote was not available. Compute, storage, public IPv4, transfer, backups/requests, logs, licenses/support, tax/fees and teardown residue all require verified input. No fabricated price, free assumption or trial entitlement was used.

## 17. AGGREGATE EXPECTED POC COST

**NOT_CALCULABLE_FROM_VERIFIED_INPUTS.** Proposed quantities are 168 m6i.xlarge node-hours, 96 m6i.large node-hours and 21,696 GiB-hours EBS before billing rounding/delay reserves, plus all shared components. The aggregate boundary is $150, including a proposed $30 reserve within that total. Unknown price blocks a maximum. Minimum required budget is undetermined; A/B/C require separately resolved authorization if the full aggregate cannot fit. Actual spend is $0.

## 18. 72-HOUR FEASIBILITY

**NOT_PROVEN.** The conditional schedule fits planned sequential source/restore trials by H54, deletion by H60, verification by H66 and contingency until H72. It depends on pre-paid compatibility/setup work and measured trial duration. Repeated 10,000-ACK failures, regional rotations and API benchmarks cannot be weakened to fit. Stop before provisioning an affected portion if complete coverage cannot fit the budget/time cap.

## 19. TEARDOWN PLAN

All 36 resource groups have dependencies, deletion process, verification and residue fields. Expand each to account/region/provider IDs with four POC tags, owner, marker and expiry. Export evidence; stop writers; delete source/restore/DCS/runner nodes, disks/backups/PITR, networking, monitoring and POC identities in dependency order. Verify actual absence in every region; retain delayed-charge evidence. Current inventory is empty.

## 20. STOP CONDITIONS

Immediately stop new paid creation on projected spend over $150, risk of crossing H72, early hard candidate failure, missing cleanup authority, identity/isolation uncertainty, production credentials or an unpriced component. Preserve evidence and perform only safe authorized containment/cleanup. Alerts do not enforce the budget and no extension is implicit.

## 21. FILES CREATED

Architecture documents: `database-poc-harness.md`, `database-poc-bom.md`, `database-poc-scorecard.md`, `database-poc-failure-matrix.md`, `database-poc-teardown.md`, and this report.

Harness: `scripts/poc/{core,fixtures,database,schema,qualification,application,cli,scenarios,bom,latency,latency-workloads,fault-probes}.mts`, `scripts/poc/test/harness.test.mts`, `scripts/poc/tsconfig.json`, `scripts/poc/eslint.config.mjs`, `scripts/poc/README.md`. Ignored local validation/copy outputs are under `test-results/lp-prod-002a` and `test-results/poc`.

## 22. FILES MODIFIED

Only four existing documents were intentionally updated: [POC plan](database-poc-plan.md), [database evaluation](database-evaluation.md), [production roadmap](production-roadmap.md), and [implementation backlog](implementation-backlog.md). All application/dependency/infrastructure changes already present before this ticket were preserved.

## 23. LOCAL TESTS RUN

- Harness strict TypeScript compile: PASS.
- Harness ESLint: PASS.
- Harness unit tests: **29 passed, 0 failed, 0 skipped**, including guard/marker refusal, fixture field/enum/determinism coverage, 10,000-write simulated ACK reconciliation, unknown/retry/duplicate handling, journal preservation, latency reporting, hard scorecard, scenario/BOM and price-cap controls.
- Offline CLI plan, isolated workspace preparation and cleanup-plan: PASS; 26 models / 26 enums / 17 migrations / 13 scenarios / 36 resource groups.
- Isolated Prisma validate and generate: PASS; no connection or migration. Initial dependency-junction failure was corrected and rerun.
- Isolated API typecheck: PASS after sandbox access to installed declarations was granted. The initial sandbox could not read `@types/pngjs`/`@types/yauzl`; no dependency versions were changed.
- Final documentation/scope checks: PASS, 134 local links checked; 492 of 496 baseline files unchanged, exactly four intended documentation updates, production release-gate file unchanged. All 29 report sections and 13 failure definitions are present. Formatting and `git diff --check` pass. Evidence is retained under ignored `test-results/lp-prod-002a`; `api-typecheck-rerun.json` records the successful sandbox-access rerun alongside the earlier failed attempt.
- Live candidate migration, application/DB integration, transaction/fault probes, regional survival, benchmarks and restore: **NOT_RUN**. Docker/psql were unavailable; no database was installed or provisioned.

## 24. KNOWN COMPATIBILITY RISKS

PostgreSQL strict fencing/remote-flush eligibility; Cockroach connector/SQL migration equivalence and retries; Yugabyte lock/PL/pgSQL/index/adapter semantics; Supabase role assumptions; legacy tenant FK gaps; runtime least privilege; immutable DELETE boundaries; request-inline external side effects; lack of universal application idempotency; local object bytes. These are documented gaps, not fixes hidden in the POC.

## 25. UNRESOLVED PROVIDER FACTS

Account/region capacity, image IDs/digests, security baseline, authoritative full pricing, license/trial/support terms, exact fencing/partition/backup controls, supported PITR, TLS/egress paths, identity and cleanup rights, observed workload runtime and actual billing residue. No dashboard verification occurred.

## 26. REQUIRED HUMAN INPUT

Before a paid-authorization request: name the isolated account, operator and independent cleanup reviewer; provide/verify exact official quotes, license/support terms and allowed access/fault boundaries; resolve image/security pins and full aggregate timing/cost feasibility. **No credentials should be pasted into chat.** This report does not request spending permission while those prerequisites remain unresolved.

## 27. RECOMMENDED LP-PROD-002B EXECUTION PLAN

Complete cost-free candidate/schema and API benchmark integration first; verify isolated identities and exact fault/restore adapters; resolve all immutable version pins and official quotes; prove aggregate $150/H72 feasibility with cleanup authority. Only then request explicit bounded paid authorization. Execute candidates sequentially: compatibility -> real application/tenant/transaction checks -> 10,000-ACK baseline -> F01–F13 with required rotations -> latency/restore -> hard scorecard review. Export evidence and tear down at each track's end; verify all shared resources deleted by the deadline. An early hard failure ends that candidate's expansion. No production cutover follows automatically.

## 28. READY_FOR_PAID_POC_AUTHORIZATION

**NO.** Complete official prices and cost/timing feasibility, account/image/support facts, candidate integrations and tested provider fault/cleanup controls are still required. The owner-approved budget boundary is not permission to spend.

## 29. READY_FOR_REAL_CUSTOMER_PRODUCTION

**NO.** No database candidate is qualified, no new production guarantee is established, and no production release gate was changed to PASS.
