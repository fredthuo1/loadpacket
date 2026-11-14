# Bounded database POC plan — LP-PROD-002 preparation

LP-PROD-002A update, 2026-10-02: isolated [harness](database-poc-harness.md), [CLI](../../scripts/poc/README.md), [BOM/pricing gate](database-poc-bom.md), [failure matrix](database-poc-failure-matrix.md), [scorecard](database-poc-scorecard.md) and [teardown plan](database-poc-teardown.md) are prepared. Local harness tests validate tooling only; live database/API/region/restore qualification remains NOT_RUN. No resources or production changes occurred. Use the guarded CLI and isolated source copy for execution; commands below are architectural guidance, not permission to run against the ordinary API environment. Paid execution is LP-PROD-002B and remains blocked by verified pricing, identity/cleanup ownership, image/support/license pins, candidate integration and fault-adapter readiness. See the [002A report](lp-prod-002a-report.md).

Prepared by LP-PROD-001 on 2026-10-01. **PLAN ONLY; nothing provisioned, migrated or faulted.** Source basis: [compatibility inventory](database-compatibility-inventory.md), [write paths](current-write-paths.md), [database evaluation](database-evaluation.md). No winner selected. Candidate-specific product claims in the evaluation require version/tier confirmation before execution.

## Authorization and safety boundary

Owner-approved **maximum aggregate cloud spend: $150 USD** and **maximum runtime: 72 hours from first paid resource creation**. This covers all tracks, object tests, backups, network, logs, taxes/fees and teardown residue together, not $150 or 72 hours per track. Prefer local/free/trial resources only when their evidence is valid. The budget boundary is **not authorization to provision**. LP-PROD-002 needs explicit authorization before creating paid resources; LP-PROD-001 creates none.

Use isolated disposable accounts/projects/databases and synthetic two-tenant fixtures only. No production credentials, customer copies, production `.env`, production resource IDs, source DB connection or peering into production. Disable external real email/purchase side effects with synthetic adapters. Test network faults only inside a resource allowlist. Separate run ID, owner, region and expiry labels on every resource; independent controller/ACK ledger must survive the injected region failure. Abort on any production target, secret leakage, unpriced resource, unexpected billed component or integrity failure.

## Stage 0 — local preparation and procurement gate

1. Freeze source/lockfile/schema/migration hashes and record Node 24, pnpm 12.3.4, Prisma 7.10.0 and resolved adapter versions. Use an isolated working copy for any candidate adapter/connector experiments; preserve production source/history.
2. Name POC operator and independent reviewer. Select exact versions, services, regions, trial limitations, quorum placements, backup features, account boundaries, fault controls and teardown method. UNKNOWN product/tier capability is a blocked requirement, not a PASS.
3. Build synthetic organization A/B, OWNER/BACK_OFFICE/DISPATCHER/DRIVER identities, ratecons, BOL/POD/signatures and Finance/import fixtures with deterministic expected values. Do not invoke production login/invitations. Use API test auth adapters that still exercise authorization/tenant logic.
4. Inspect every test runner's database target and cleanup behavior. Existing [Finance wrapper](../../scripts/finance-regression.ps1), [Finance launcher](../../apps/api/test/finance.database.cjs) and [signature launcher](../../apps/api/test/signatures.database.cjs) deliberately require the exact isolated localhost database. They cannot be pointed at a cloud candidate by simply changing DATABASE_URL. Build a **POC-only reviewed wrapper** that preserves fail-closed target checks, confirms pinned engine identity and run-specific disposable database marker, and runs the same suite against the candidate. Never disable the guard in the normal runner or run a suite against the wrong engine and label it candidate evidence.
5. Obtain current written estimates for the full intended topology and failure/restore actions before provisioning. Expected spend including conservative traffic/backup/cleanup reserve must remain <=$150. No unbounded autoscaling, marketplace minimums or nonrefundable plan commitments. If any portion cannot fit, stop **before** provisioning that portion and report components, priced additional budget and why local evidence cannot replace it.
6. Obtain explicit LP-PROD-002 paid-resource approval, approved bill of materials and owner/operator/cleanup access. Until then only offline plan/harness work is ready. Repository-only production evidence gaps do not prevent a synthetic local POC, but remain production blockers.

## Candidate tracks and feasibility gates

### A — strict synchronous PostgreSQL

Use a vendor-supported remote synchronous deployment if affordable, or explicitly scoped disposable self-managed POC with the operational burden recorded. Require data in separate regions, durable remote flush before every successful commit, a fenced single writer, eligible synchronized promotion and a three-domain control plane. Counts of replicas alone are insufficient: placements must enforce the remote-region requirement before and after failover. No async downgrade, forced stale promotion or `remote_write` substitution. App role must not bypass the chosen guarantee; test runtime session settings/privilege boundaries and whether the proposed managed service exposes enough proof/control.

The split-brain test is topology-aware: only the authorized writer with a valid lease and required remote durable acknowledgements may commit; only the control-plane quorum side may promote an eligible survivor. If no safe eligible writer exists, reject writes on **both** sides. Control-plane quorum alone does not prove a candidate has the acknowledged WAL.

Reject an offering that supplies only regional HA with async cross-region DR. If minimum supported topology or required fault/restore controls exceed $150, mark regional track BLOCKED_BUDGET/PROVIDER, retain local compatibility results and request a priced extension; do not substitute async to pass.

### B — CockroachDB

Use explicit region-survival placement with independent regional data voters; the evaluation's five-voter 2/2/1 layout is a candidate to verify, not an assumed plan default. Record each range's placement/lease behavior and strong-read mode. A one-region free cluster proves syntax only. Pin engine/tier/connector; use the appropriate Prisma Cockroach provider in a separate POC copy and document every native-type/DDL change. Test the original migration statements to identify incompatibilities, then a reviewed target baseline with equivalent constraints/triggers/roles. Never erase original migration history or award migration PASS without an equivalence manifest.

Advisory locks, RLS/roles, PL/pgSQL/trigger behavior and serializable conflict handling are high-risk gates. Unsupported integrity semantics disqualify the unchanged application; only a separately reviewed equivalent implementation can reopen the track. Stop before paid creation if a real region-survival tier cannot be tested within the cap.

### C — YugabyteDB YSQL

Evaluate one synchronous universe across three regions with data and master/control quorum placement; asynchronous xCluster is not a substitute. Pin YSQL/server/adapter versions. Prove advisory locks/hashtextextended, triggers, FKs, isolation, row locks and retries on the actual version with Prisma 7.10.0. Do not accept no-op locks, suppressed unsupported-operation errors or preview flags as production support proof. A local multi-node universe tests behavior, not regional resilience. Confirm supported service tier, fault access and backup/restore feasibility before paying; otherwise mark the regional portion blocked with priced next steps.

## Real-schema and application qualification

Use all 17 source migrations and an empty disposable database; **no production migrate reset, db push shortcut or migration editing**. Some REVOKEs assume `anon`/`authenticated`; declare inert NOLOGIN compatibility roles in POC setup where appropriate, with no inherited grants. Record this prerequisite separately. If the engine cannot represent the required security boundary, fail the track. Test payment legacy backfill on synthetic upgrade fixtures as well as empty migration replay.

Record catalog diff against the [complete schema inventory](database-compatibility-inventory.md): 26 models/enums, PK/unique/FK/index definitions, nullability/defaults, view, triggers, CHECKs, grants/RLS, referential actions. Validate/generate Prisma using only injected disposable config. Example command sequence for the future approved POC working copy, after its target guard passes:

```text
pnpm --config.verify-deps-before-run=false --filter api exec prisma validate
pnpm --config.verify-deps-before-run=false --filter api exec prisma generate
pnpm --config.verify-deps-before-run=false --filter api exec prisma migrate deploy
pnpm --config.verify-deps-before-run=false --filter api typecheck
pnpm --config.verify-deps-before-run=false --filter api lint
pnpm --config.verify-deps-before-run=false --filter api build
pnpm --config.verify-deps-before-run=false --filter api test --runInBand
pnpm --config.verify-deps-before-run=false --filter api test:e2e --runInBand
```

These commands were **not run by LP-PROD-001**. Candidate B needs its reviewed equivalent baseline before deploy. Run Finance, signatures, payments, stop-events/concurrency, invitation and company-driver isolated DB suites through the candidate-aware wrapper, not just mocked HTTP suites. Preserve normal web/mobile gates for changed POC integration behavior. Attach results including test count, skipped tests, actual engine identity and hashes. An unavailable test is NOT_RUN, not PASS.

Required cases:

- Decimal exact max/scale/sums/adjustments; Date/date-only/timezone/DST/millisecond round trips; Json null/arrays/large values; enums and enum migration; UUID defaults/casts; byte checksums; partial/expression/nullable indexes; composite tenant/signature relations; delete/restrict/cascade checks.
- Two independent tenants and users: API IDOR, wrong Driver assignment, payroll/sensitive document role boundaries, guessed related IDs, revoked user, pooled tenant context if proposed; direct SQL cross-tenant attempts with the intended runtime role. Existing legacy FK gaps must be exposed, not hidden by happy-path fixtures.
- Multi-record success/rollback, concurrent updates, overlapping assignment/accept/start/complete, concurrent stop events, document correction/current-version signature races, Finance key hash conflict and historical/live duplicate races across independent connections/regions. Compare exact Decimal totals and event count after every race.
- Verify row/advisory locks truly block conflicting peers. Exercise deadlock/serialization errors, bounded retries and pool timeouts; no external side effect inside automatically retried callbacks. Record existing application gaps as blockers and distinguish candidate engine result from application adoption result.
- Kill node/leader; lose each region separately; partition A from B+C then rejoin; delay/drop response after commit; lose quorum; recover/failback; stale routing; interrupted migration on disposable DB. No automatic quorum reduction, DNS-based independent leader or force-promotion cheat.

## Deterministic acknowledged-write ledger

Maintain a durable client journal on an independent controller outside the failed region; fsync its receipt records and protect the journal from the injected fault. Use synthetic `runId`, tenant, operation key, canonical request hash, expected amount/version/event IDs and attempt timestamps. Never log tokens/document bodies.

For each candidate and qualifying failure scenario:

1. Seed deterministic fixture PRNG; issue `WRITE-000001` through `WRITE-010000`. Use real application transactions with an identifiable synthetic operation association; where the current endpoint has no reusable key, explicitly mark its replay test failing/not implemented instead of inventing application idempotency. A separate DB-level probe ledger may qualify engine durability but cannot substitute for these workflows.
2. Log SUCCESS only after a validated successful response and matching operation identity. Flush the journal entry before counting it. Freeze the fault trigger until exactly 10,000 baseline SUCCESS entries are durable. Trigger the planned leader/region failure immediately; the authoritative recovered state must contain **all 10,000 baseline ACKed writes** with correct values and no duplicate business effects.
3. In separate deterministic active-write runs, trigger at specified operation barriers immediately before commit, while commit is in flight and after commit but before the response. The entire acknowledged subset before the failure must survive; never fill the denominator with writes acknowledged only after recovery to conceal a loss. Keep these counts separate from the exact 10,000 baseline trial.
4. Timeout/reset/no validated response = **UNKNOWN_OUTCOME**, even if the HTTP caller saw an error after commit. Definite pre-write rejections are separate. After recovery query the authoritative writer/strong-read path, reconcile by the same stable key/hash, then retry eligible unknowns with that same key. Do not count unknowns automatically as rejected or successes; retain unresolved cases as a failed completeness gate.
5. Compare journal to authoritative rows, FK relationships, audit/event counts and exact financial values. Expected baseline: ACKNOWLEDGED 10,000; PRESENT AFTER FAILURE 10,000; LOST ACKNOWLEDGED 0. Any lost acknowledged record, conflicting history or duplicate financial effect = **POC FAIL**. Document orphan committed unknowns separately and reconcile them.

Repeat failures across eligible leaders/regions and record fault timing, topology/epoch and restore timeline. One passing trial supports only the tested failure model: single-region loss/network partition, not simultaneous destruction of all replicas or logical corruption.

## Split brain, recovery and latency

Attempt tagged writes from both sides of a partition. For distributed candidates only a data-quorum side may commit; minority must reject/fence. For PostgreSQL use the stricter lease + eligible remote-flush policy above. Loss of required quorum/remote durability must stop authoritative ACKs; serving reads must not create a second history. On rejoin compare histories, dedup keys, balances and evidence references; no independent election through DNS. Record rejected and unknown writes from both sides.

Recovery cases: snapshot restore into a new isolated target; PITR/equivalent to immediately before a synthetic mistaken update/deletion; independent backup restoration with keys; restore migration/roles and synthetic document manifest. A point-in-time corruption restore intentionally rolls back later records: reconcile/export valid post-target ACKs before any hypothetical cutover. Do not confuse PITR's historical state with zero loss of all later accepted transactions. No source or customer restore occurs.

Measure driver-facing accept/start/stop/complete, Finance transaction and import under single-region reads and cross-region writes, normal and one-region-lost states. Record per-operation p50/p95/p99, error/unknown/retry rates, lock time, pool saturation, CPU/IO and throughput; include file sizes and concurrency. Proposed ordinary mutation budgets: p95 <=1.5s and p99 <=3s at declared load; upload/import budgets reported separately. Safe serving failover <60s and warm recovery <15m are proposed objectives to measure, not current guarantees. Latency preferences may be reviewed before a run; durability cannot be weakened for speed.

## Decision scorecard

For each dimension save A/B/C status, evidence/run ID, exact version/topology, limitations and reviewer. Default all unrun results to NOT_VERIFIED.

**Hard requirements:** zero lost ACKs in failure model; regional survival with fenced single history; minority/quorum-loss write rejection; exact money/data types; transaction/lock/constraint/tenant correctness; equivalent schema/migration semantics and current Prisma integration; immutable evidence linkage; recoverable backup/PITR or a reviewed equivalent corruption-recovery capability; no insecure bypass; safe unknown-outcome reconciliation. Any failed hard requirement disqualifies a production candidate regardless of preference score. Missing application idempotency/objects can block end-to-end qualification even if engine-only durability passes.

**Preferences, after hard gates pass:** measured latency/headroom, operational burden, supported managed-service maturity, observability, cost class, small-team operability, vendor lock-in and migration risk. Score each 1–5 with explanation, not a winner by simple sum. Compare support, restoration complexity, staffing and ongoing cost, not only trial pricing. Architect/SRE/security/product must review the resulting ADR; no winner today.

## Resources, schedule and cost controls

Expected components: disposable DB data nodes/managed cluster per track, control-plane nodes where needed, region networking/TLS, independent client/ledger runner, temporary API workers, synthetic private storage/scanner, backup/archive/restore capacity, encryption keys, minimal logs/metrics and traffic. Reuse the runner and test tracks sequentially; do not retain idle candidate clusters. Local fault simulations have no cloud compute bill but consume host resources and cannot establish genuine regional independence.

Minimum planned investigation: local setup/schema work before the paid timer, then approximately 8–12 active hours **per feasible regional candidate** for controlled faults, restore and measurements. This is a scheduling estimate, not a promise that a complex candidate qualifies in that time. Suggested paid window: H0–6 setup; H6–42 up to three sequential tracks; H42–54 recovery/object evidence; H54–60 reconciliation; H60–66 teardown; H66–72 independent teardown verification. No full production soak is implied. If insufficient, retain a partial report and stop; no silent extension.

No dollar estimate is fabricated. Cost class is **multi-region compute/storage/network plus temporary restore overhead**, potentially beyond $150 even when local compatibility is free. Before each paid action calculate: committed cost + worst-case remaining runtime cost (rounded billing units) + storage/backup/egress/requests/keys/logs/fees + deletion/retention reserve. Must stay <=$150 and expire <=72h from first paid creation. Proposed internal reserve $30 is part of the $150 cap, not permission to spend another $30. If the estimate cannot be bounded, do not provision.

Configure alerts where supported, suggested cumulative $75/$100/$125 thresholds, but alerts may lag and are not a hard spending cap. Disable automatic plan upgrades; cap nodes/storage/log retention and synthetic traffic. Review cost and inventory at each milestone and at least every 6h while paid resources exist. Stop new tests early enough to delete resources before the hard limit. The operator owns termination even if tooling fails. Never claim a configured budget alert guarantees the bill ceiling.

## Teardown and evidence handoff

Maintain resource ID/account/region/type/purpose/create-time/expiry/estimated-rate/owner/delete-command/status inventory. Before creating resources confirm deletion rights and minimum retention; immutable object locks must expire early enough for verified cleanup. Stop writers/faults, export synthetic evidence and hashes to the local report, revoke POC credentials, then delete only allowlisted POC clusters/nodes/volumes/LBs/IPs/buckets/object versions/snapshots/backups/log sinks/keys as permitted. Remove scheduled jobs and paid subscriptions/minimums. Verify each region/account inventory empty and mark pending-billing/retention charges until resolved; a delete request alone is not teardown proof. No production resources may enter this allowlist.

Deliver: candidate schema diff, all test results/skips, 10,000-ACK and unknown ledgers, split-brain proof, exact restore manifests, latency distributions, cost ledger, resource deletion evidence and ADR recommendation or explicit disqualification. **READY_FOR_LP_PROD_002: NO for paid execution until priced topology, named owners and explicit authorization are supplied; repository/local preparation is ready.** Production readiness remains NO.
