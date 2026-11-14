# LP-PROD-01 PRODUCTION ARCHITECTURE REPORT

Date: 2026-10-01. Scope: audit/design/documentation/planning only. This report is distinct from the earlier single-instance hosting report with the same ticket label.

## 1. EXECUTIVE SUMMARY

The architecture package defines how to move from working MVP features to verified multi-site durability while preserving the modular monolith. It does not certify current hosting for real customer data. The core acknowledgement contract is prominent in [principles](production-principles.md); all infrastructure decisions remain proposed until qualified. **READY_FOR_REAL_CUSTOMER_PRODUCTION: NO.**

## 2. CURRENT STATE

Implemented: Nest/Next/Expo, Supabase authentication, role/tenant service checks, PostgreSQL/Prisma, 17 migration directories, versioned/checksummed evidence, exact-decimal Finance, Driver/load lifecycle, signatures, RevenueCat and local regression scripts. These are useful application safeguards, not a demonstrated regional guarantee. API filesystem storage, request-inline provider I/O, connectivity-only health and memory-bound mobile pending work remain temporary architecture. Worker/Terraform directories are empty; CI/outbox/production telemetry/recovery evidence is absent. External provider settings remain UNKNOWN_REQUIRES_VERIFICATION. See the [35-capability audit](current-state-audit.md).

## 3. CRITICAL PRODUCTION GAPS

No verified synchronous regional commit contract, redundant evidence receipt protocol, write fencing/readiness, universal idempotency/outbox, independent immutable recovery, exercised failover, complete tenant DB defense, unified malicious-upload quarantine, durable mobile queue or operational alert/response system. Historical/Finance currency and delete/immutability boundaries need explicit qualification. Existing successful tests do not close these gaps.

## 4. TARGET ARCHITECTURE

Global edge; stateless active A/B Next/Nest sites and workers; qualified A/B/C SQL data plane; private immutable object stores with two distinct regional receipts before upload success; separate recovery administration; SQL outbox; optional expendable caches. Managed services preferred; no Kafka/Kubernetes/event sourcing/search cluster/warehouse added. [Target](production-architecture.md).

## 5. DATABASE RECOMMENDATION / POC STATUS

Preserve PostgreSQL until POC. Qualify supported strict synchronous cross-region PostgreSQL, compare CockroachDB region survival and Yugabyte synchronous YSQL using real schema, locks/triggers, Prisma 7.10.0 and full tests. Ordinary regional HA plus asynchronous cross-region replication is disqualified for this RPO contract. No engine selected and no POC executed. [Evaluation and official sources](database-evaluation.md).

## 6. MULTI-REGION STRATEGY

Active-active app serving with one authoritative consensus/fenced data plane. C provides data/control votes as appropriate; C backups have separate administration. No minority writes or DNS-based writer election. Failback requires rejoin/reconciliation, not routing to stale state. [Topology](multi-region.md).

## 7. RPO/RTO DESIGN

Regional acknowledged-write RPO 0 under stated single-region failure; target safe failover <60s and warm DR <15m where proven. Cold restore is dataset/throughput dependent and not promised at 15m. Logical corruption and simultaneous loss beyond the failure model need separate recovery/RPO accounting. Unknown commit outcome never means “No changes were accepted.” [Durability](data-durability.md), [DR](disaster-recovery.md).

## 8. DOCUMENT DURABILITY DESIGN

Private quarantine, uniform type/magic/size/malware checks, server SHA-256, immutable exact-version receipts from two regions, then metadata/audit/outbox quorum commit. Preserve original document/signature bindings and retain uncertain artifacts pending reconciliation. Async replication alone cannot establish upload acknowledgement. [Evidence design](object-storage.md).

## 9. BACKUP/RECOVERY DESIGN

Continuous PITR, snapshot/immutable evidence archive, independent account/keys, retention reviewed with counsel/product and weekly isolated restore drill covering full manifests, Finance and signatures. Replication is not backup; restored historical deletion/hold state must be respected. [Recovery](backup-and-recovery.md).

## 10. SECURITY / TENANT ISOLATION

Source review covers all 26 models and 50 mutation declarations. Legacy parent-ID-only relations need composite integrity; public Data API RLS denial does not prove tenant enforcement for privileged Prisma. Scoped support, least privilege, role mapping, parser isolation and all-route IDOR tests are required. No claim of complete penetration-test coverage. [Model inventory](tenant-model-inventory.md), [security](security.md).

## 11. OBSERVABILITY

OTel-compatible request/trace/operation correlation, commit/object/outbox/backup metrics, external safe synthetics and PAGE/WARNING/INFO policy, with redaction and named escalation. No actual paging/monitoring was provisioned. [Design](observability.md).

## 12. MOBILE OFFLINE STRATEGY

Encrypted tenant-bound persistent queue and private files; PENDING_LOCAL, SUBMITTING, CONFIRMED_SERVER, FAILED; stable keys/hashes and server outcome reconciliation. “Saved on this device — Not yet submitted” is distinct from “Submitted.” Device loss before submission remains outside server RPO. [Design](mobile-offline.md).

## 13. DEPLOYMENT / MIGRATION STRATEGY

Immutable artifacts, protected migrations, staging/approval/canary, same digest across sites. Resolve Next build-time public-config differences before claiming same-byte staging promotion. Render migration uses copy/CDC and checksums, shadow reads, final write fence/delta reconciliation, controlled cutover and safe rollback boundary. After target writes, never revert to stale source without reconciliation. [Plan](deployment.md).

## 14. COST CONSIDERATIONS

Five organization bands use actual users/Drivers/QPS/load/documents/bytes/retention and growth metrics, with formulas for all compute/DB/transfer/storage/backups/edge/telemetry/provider/support/security categories. No invented exact pricing or provisioned capacity. Fixed durability cost floor requires budget approval. [Model](production-cost-model.md).

## 15. P0 BLOCKERS BEFORE REAL CUSTOMER DATA

All 27 [mandatory gates](release-gates.md) remain NOT_VERIFIED: A and B deployments, global routing, automatic site failover, SQL quorum/failover, RPO-0 ACK test, object durability, checksum validation, PITR, immutable backup, backup restoration, tenant isolation, IDOR, idempotency, outbox, audit, fail-closed writes, monitoring, paging, security review, load testing, incident runbook, DR runbook, durable mobile pending work, Finance/evidence history, controlled release/migration and customer lifecycle/support. Each needs objective evidence before PASS; no provider change was made to close them here.

## 16. P1 ITEMS

LP-PROD-018 organization billing abstraction; 020 role normalization/integration boundary cleanup; 021 support workflow automation. Minimum safe existing-role authorization, support and privacy controls remain P0.

## 17. P2 ITEMS

LP-PROD-019 derived analytics/search if justified by measured queries; 022 cache/worker execution optimizations. SQL remains authoritative; optimization cannot hold the sole critical state.

## 18. FILES CREATED

Created 49 Markdown files: 26 in docs/architecture, 12 in docs/adr and 11 in docs/runbooks. Complete clickable inventory is in [README](README.md): architecture designs, audit/model/mutation inventories, backlog, roadmap, test/gate policy and this report. The [validation manifest](../../test-results/production-architecture/validation.json) lists every created path; it is a local ignored test artifact.

## 19. FILES MODIFIED

None of the files present at this task's baseline were intentionally modified. Earlier application/dependency/RevenueCat work and the old hosting report are preserved. All deliverables are new documentation in docs/architecture, docs/adr and docs/runbooks; ignored validation artifacts are local evidence.

## 20. ADRS CREATED

0001 platform, 0002 topology, 0003 database, 0004 objects, 0005 RPO/RTO, 0006 outbox, 0007 idempotency, 0008 tenancy, 0009 backups, 0010 observability, 0011 deployment, 0012 offline synchronization. All PROPOSED — REQUIRES POC. [Index](README.md).

## 21. RUNBOOKS CREATED

Regional failover, database failover, database restore, object recovery, backup restore drill, write readiness, read-only mode, deployment rollback, credential rotation, incident response and scoped customer recovery. Each contains purpose, trigger, preconditions, automatic/manual actions, validation, rollback, customer impact, escalation and post-incident actions. [Index](README.md).

## 22. IMPLEMENTATION TICKETS CREATED

LP-PROD-001 through LP-PROD-023, each with priority/problem/scope/exclusions/dependencies/notes/security/data safety/test/acceptance/rollback/documentation. Eighteen P0, three P1 and two P2 tickets. [Backlog](implementation-backlog.md), [phases 0–6](production-roadmap.md).

## 23. TESTS RUN

Node 24.19.0 documentation validation: PASS. Checked 49 Markdown documents, required architecture files, 12 proposed ADR statuses, all ten required sections in each of 11 runbooks, all 13 fields in 23 tickets, local source/document links, closed code fences and 11 Mermaid source blocks. Source-scope SHA-256 comparison: no pre-existing source/config/document file changed; all 49 new nonignored files are documentation. Scoped Prettier validation and git diff --check: PASS. Reproducible local validator and results live under `test-results/production-architecture`; the manifest records link counts and exact paths.

No application suite, live provider operation, DB connection or migration was necessary for these documentation-only changes. Historical application test results are labeled as prior evidence in the audit, not claimed as reruns. Mermaid diagrams were checked structurally and manually, not rendered by a Mermaid runtime; they are not deployment/failover evidence.

## 24. PRODUCTION CHANGES

NONE.

## 25. DATABASE MIGRATIONS

NONE.

## 26. CUSTOMER DATA CHANGES

NONE.

## 27. GIT COMMIT/PUSH

NONE.

## 28. RECOMMENDED NEXT TICKET

LP-PROD-001: collect authorized read-only topology/backup/privilege/ownership evidence and approve the bounded synthetic POC. Then LP-PROD-002: run real-schema database compatibility/durability/restore evaluation. Neither action is implicitly executed by this documentation task.

## 29. READY_FOR_REAL_CUSTOMER_PRODUCTION

NO. Exactly the 27 unresolved P0 gates in section 15 and release-gates.md require current objective evidence. Documentation completion is not permission to launch or silently reduce the contract.
