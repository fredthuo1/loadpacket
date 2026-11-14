# LP-PROD-001 CURRENT INFRASTRUCTURE EVIDENCE REPORT

Date: 2026-10-01. Scope confirmed by owner: **repository evidence only**. Status: **repository audit and POC preparation complete; provider evidence deferred; production qualification incomplete**. This report follows [LP-PROD-01](lp-prod-01-report.md) and does not restart or change implemented application features.

## 1. EXECUTIVE SUMMARY

SOURCE/CONFIG: the current application has tenant-aware services, PostgreSQL/Prisma transactions, immutable-key local file writes and partial idempotency. It does not establish regional acknowledged-write durability or independently recoverable evidence. Exact deployed topology, live privileges, backup settings and administrative ownership cannot be certified from this checkout. All are explicitly UNKNOWN where evidence is absent. The nine required evidence/POC documents are complete; no provider setting is reported enabled from defaults.

## 2. SAFETY CONFIRMATION

Production changes: **NONE**. DB migrations: **NONE**. Customer-data changes: **NONE**. DNS changes: **NONE**. Credential rotation: **NONE**. Git commit/push: **NONE**. Provider access/configuration, database connections, deployments, paid resources, failover and production synthetic uploads: **NONE**. No environment variable values or secrets were read/printed. Only architecture documentation and ignored local validation artifacts were written. Earlier dirty/untracked work was preserved.

## 3. CURRENT TOPOLOGY

[Infrastructure evidence](current-infrastructure-evidence.md): SOURCE/CONFIG verifies Node 24 Docker web `next start`, Nest API, PostgreSQL adapter, local document filesystem, Supabase identity/invitations and mobile RevenueCat. Render web/API operation is HISTORICAL_EVIDENCE; actual service IDs, regions, replicas, image digests, disk mounts and deployment source remain UNKNOWN. No implemented worker, distributed queue/cache or IaC/CI deployment was found. Repository absence is not proof that manually configured external resources do not exist.

## 4. CURRENT DATABASE

SOURCE/CONFIG: PostgreSQL Prisma provider, Prisma/client 7.10.0, PrismaPg, server-only DATABASE_URL, client pool max 5. Server provider/version/region, direct-versus-pooler path, TLS, connection limit, HA/replication and applied migration history are UNKNOWN. Repository has 17 migrations; none was connected to or executed.

## 5. DATABASE PRIVILEGE MODEL

[Privilege inventory](database-compatibility-inventory.md): runtime and migration configurations name DATABASE_URL, but actual principals may differ. Runtime/migration/admin role identity, CREATE/ALTER/DROP authority, role memberships, owner/BYPASSRLS, table/schema/sequence ownership and installed extensions are UNKNOWN. A future read-only catalog checklist is supplied; it was not executed. RLS/revokes in migrations are not runtime least-privilege evidence.

## 6. PRISMA/SCHEMA COMPATIBILITY RISKS

SOURCE: exhaustive appendix includes 26 models, 26 enums, no composite primary IDs, 34 compound unique declarations, 40 Prisma model indexes, all Decimal/Json/Bytes/DateTime fields, relations/actions and all migration fingerprints. PL/pgSQL triggers, advisory locks/hashtextextended, row locks, raw Finance SQL/view, partial/expression indexes, role-name assumptions and callback side effects require real POC tests. Fresh PostgreSQL must account for unconditional Supabase-role REVOKEs; Cockroach requires a different reviewed connector/baseline approach. No engine is declared fully compatible.

## 7. CURRENT DOCUMENT STORAGE

SOURCE: a single configured `LocalDocumentStorage` root; exclusive file create, private modes, relative keys, versions and SHA-256. Production requires an absolute DOCUMENT_STORAGE_ROOT; the live mount is UNKNOWN. Docker prepares `/data/loadpacket/documents` but cannot prove a persistent provider disk. No explicit fsync contract, remote receipts, regional object adapter or quarantine scanner. Finance import originals reside in DB Bytes instead.

## 8. CURRENT BACKUP EVIDENCE

[Backup evidence](current-backup-evidence.md): provider DB automated backup/PITR/snapshot/retention and document-disk snapshots/retention/restore settings are all UNKNOWN. No fresh restore proof or independent administrator/key boundary. The repository's proposed backup schedules are not enabled-state evidence. Neither provider backup enablement nor disablement is asserted.

## 9. ADMINISTRATIVE FAILURE DOMAINS

[Domain map](administrative-failure-domains.md) covers GitHub/GHCR, Render, DB provider, Supabase, EAS, Apple, RevenueCat, email and DNS. SOURCE/CONFIG identifies integration dependencies and EAS declaration, not actual owners/MFA/recovery controls. Shared-account compromise edges and backup administrative independence remain UNKNOWN. Named operator/security/recovery custodians are still required.

## 10. CURRENT SINGLE POINTS OF FAILURE

[Register](single-points-of-failure.md) identifies verified application dependencies: one configured local document destination, one configured database authority, sole implemented Supabase identity/invitation path and paid RevenueCat dependency. Each includes impact, data-loss risk, current/target controls and priority. One deployed replica/region/disk/writer/admin/DNS account is deliberately not asserted without provider evidence.

## 11. TENANT-ISOLATION BASELINE

SOURCE: all 25 tenant-owned models carry organizationId; global guards and service/Prisma predicates enforce organization/role/assignment. Newer Finance/vault/signature/payment FKs use tenant composites; legacy ID-only edges rely on application scoping for tenant equality. Migrations deny public Data API roles; runtime tenant RLS and privilege bypass are unverified. Priorities: role evidence, non-owner runtime/migration separation, composite legacy FKs after consistency audit, direct SQL/API/pool reuse tests and evidence/Finance DELETE/cascade protections.

## 12. WRITE PATHS / ACK POINTS

[Twelve detailed traces](current-write-paths.md) record CLIENT, API ENDPOINT, AUTH CHECK, TENANT CHECK, DB TRANSACTION, FILE WRITE, EXTERNAL CALL, AUDIT, IDEMPOTENCY and RESPONSE ACK POINT. Normal transaction responses await outer commit. Upload/signature success waits for local file put plus commit, not remote copies. Extraction persists status but no durable result ledger. Finance preview/confirm/reverse perform a detail read after commit and can error after success. Invitation provider calls inside SQL callbacks are not atomic with email delivery. No server RevenueCat subscription state exists to trace.

## 13. CURRENT HEALTH MODEL

[Health audit](current-health-model.md): `/api/v1/health` checks handler response; `/api/v1/health/database` executes SELECT 1 with sanitized failure. Proposed live/ready/write-ready endpoints are absent. Current connectivity proves neither quorum nor storage/backup durability. Future write readiness must be enforced at the operation/commit boundary and distinguish definite rejection from unknown outcome.

## 14. RPO-0 GAPS

SOURCE/UNKNOWN: no verified deployed remote synchronous/quorum guarantee, fenced failover, regional ACK ledger test, common durable operation registry/outbox, or reconciled independent restore. Local files and provider-in-transaction side effects extend beyond SQL atomicity. Existing generic error/retry handling cannot universally resolve commits whose responses were lost. Production RPO 0 remains unproven.

## 15. OBJECT STORAGE GAPS

SOURCE: no two-region receipt protocol, immutable remote version policy, unified quarantine scan, coordinated metadata/object manifest recovery or independent deletion/key administration proof. Hashes and exclusive local writes are useful existing safeguards, not proof of crash-safe regional persistence.

## 16. DATABASE POC PLAN

[Bounded plan](database-poc-plan.md): isolated synthetic disposable tracks A strict synchronous fenced PostgreSQL, B region-survival CockroachDB, C synchronous Yugabyte YSQL. Real migration/Prisma/API/Finance/signature/tenant/concurrency/type/lock/retry suites; deterministic 10,000-ACK survival plus active-write/UNKNOWN_OUTCOME trials; minority/quorum-loss rejection; snapshot/PITR/logical-corruption/backup restore; p50/p95/p99 and driver operation latency. Hard correctness gates disqualify a candidate regardless of preference score. Local tests never substitute for actual regional failure evidence.

## 17. OBJECT STORAGE POC PLAN

[Object plan](object-storage-poc-plan.md): two distinct regional checksum/version receipts before final DB commit/ACK, private encrypted immutable objects, exact-version authorized downloads, quarantine, partial-upload/unknown-commit recovery, region loss and full restored-manifest verification. Async replication alone cannot be assumed to meet ACK time; prove provider semantics or coordinate dual writes. No storage provisioned.

## 18. REQUIRED LP-PROD-002 RESOURCES

Named operator/reviewer; isolated target allowlist and fresh POC-only identities; exact priced engine/version/tier/topology; candidate-aware safe test wrapper; multi-region data/control nodes as needed; independent ACK runner; temporary backup/restore/object/scanner/logging/network resources; explicit paid-resource approval and verified teardown authority. Test-source work can begin locally in the next ticket.

## 19. ESTIMATED POC COST CLASS

No fabricated price quote. Local compatibility has no cloud compute requirement; real regional tracks add multi-region compute/storage/network plus backup/restore costs and may exceed the cap. Owner authorization is a **budget boundary only: $150 USD aggregate, 72 hours from first paid resource creation**, alerts where supported, no paid action before explicit LP-PROD-002 authorization. Quote all components before creation, reserve cleanup cost/time, stop before any unaffordable portion and report additional budget required. Every temporary paid resource must be inventoried, destroyed and independently verified; alerts are not hard caps.

## 20. FILES CREATED

All ten files under `docs/architecture/`:

- [current-infrastructure-evidence.md](current-infrastructure-evidence.md)
- [database-compatibility-inventory.md](database-compatibility-inventory.md)
- [current-backup-evidence.md](current-backup-evidence.md)
- [administrative-failure-domains.md](administrative-failure-domains.md)
- [single-points-of-failure.md](single-points-of-failure.md)
- [current-write-paths.md](current-write-paths.md)
- [current-health-model.md](current-health-model.md)
- [database-poc-plan.md](database-poc-plan.md)
- [object-storage-poc-plan.md](object-storage-poc-plan.md)
- [lp-prod-001-report.md](lp-prod-001-report.md) (this report).

Ignored local inventory/validation helpers and results are in `test-results/current-infrastructure-evidence/`; they contain source fingerprints and test metadata, not credentials or customer data.

## 21. FILES MODIFIED

Six existing architecture documents: [README](README.md), [database evaluation](database-evaluation.md), [current-state audit](current-state-audit.md), [production roadmap](production-roadmap.md), [implementation backlog](implementation-backlog.md), [release gates](release-gates.md). No application, dependencies, lockfile, Docker/EAS config, schema/migration, workflow or earlier report was changed.

## 22. TESTS / VALIDATION RUN

TEST: scoped documentation validation passed: required files and balanced fences; local link resolution; exhaustive 26-model/26-enum schema coverage; all 17 migration hashes; all ten required fields for each of 12 write families; all 27 report sections; budget/approval/unknown-outcome requirements; all 27 gates retaining NOT_VERIFIED; credential-literal screening; preserved pre-existing file hashes; exact new-file allowlist. Results: `test-results/current-infrastructure-evidence/validation.json`.

Prettier formatting passed for all 16 changed/new documents using the already installed Node 24 runtime and Prettier CLI directly. The initial pnpm formatter launcher could not resolve the command; no dependency was installed or changed to recover. `git diff --check` passed (exit 0; existing LF/CRLF warnings only). The final scope check resolved 348 local links and confirmed 480 of 486 pre-existing files unchanged; the other six are the allowed architecture documents. Exactly ten new repository documents were added. Application build/typecheck/lint/regression and provider/DB tests were not rerun for this documentation-only task. The source/hash check establishes unchanged reviewed application/configuration inputs, not runtime safety. No production gate relies on this documentation PASS.

## 23. UNKNOWN ITEMS

Actual deployed artifacts/configuration, provider/service/account/region/replica/disk topology, mobile artifact endpoint, DB engine/TLS/pooler/privileges/applied migrations/replication, backup/PITR/restore, MFA/admin/recovery/key custody, SMTP and store setup. No provider verification was authorized in the chosen repository-only scope. Evidence requests and responsible role suggestions are in the baseline documents; named owners remain unassigned.

## 24. BLOCKERS

Provider-only baseline cannot be closed from repository files. Paid POC requires explicit authorization, versioned/priced regional bill of materials, named operator/reviewer and deletion access. Whether all three regional tracks fit $150/72h is unverified. Current application idempotency/object/outbox gaps may block end-to-end qualification independently of engine success. None was silently fixed or bypassed here.

## 25. RECOMMENDED NEXT ACTION

Start LP-PROD-002 with local harness/target-guard preparation and priced feasibility review. Select exact disposable topology and operator; seek explicit paid-resource authorization only once scope/cost/cleanup are reviewable. In parallel, the owner may later supply redacted current-provider evidence under a separately authorized read-only scope. Do not migrate or cut over production.

## 26. READY_FOR_LP_PROD_002

**NO for paid regional execution.** Repository/local preparation is ready; the budget boundary is recorded. Priced feasibility, named operators and explicit paid-resource authorization are still required. This distinction prevents documentation readiness being mistaken for permission to create resources.

## 27. READY_FOR_REAL_CUSTOMER_PRODUCTION

**NO.** All 27 existing P0 [release gates](release-gates.md) remain NOT_VERIFIED. No database winner, deployment, backup guarantee or regional RPO-0 certification was created by this audit.
