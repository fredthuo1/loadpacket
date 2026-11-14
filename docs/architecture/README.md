# LoadPacket production architecture package

## LP-PROD-001 — current evidence and POC preparation

Repository-only audit, 2026-10-01. Provider facts remain unverified; no infrastructure was changed. Start with the [current evidence report](lp-prod-001-report.md).

- [Current infrastructure and tenant baseline](current-infrastructure-evidence.md)
- [Database privileges and complete schema compatibility inventory](database-compatibility-inventory.md)
- [Current backup evidence](current-backup-evidence.md)
- [Administrative failure domains](administrative-failure-domains.md)
- [Current single points of failure](single-points-of-failure.md)
- [Write paths and acknowledgement points](current-write-paths.md)
- [Current health model](current-health-model.md)
- [Bounded database POC plan](database-poc-plan.md)
- [Object-storage POC plan](object-storage-poc-plan.md)

Future POC budget boundary: $150 USD aggregate, 72 hours from first paid creation; explicit paid-resource authorization still required. No unresolved release gate is PASS.

## Original architecture package

LP-PROD-01, reviewed 2026-10-01. **READY_FOR_REAL_CUSTOMER_PRODUCTION: NO.** This is an implementation-ready design/backlog, not a completed infrastructure migration or durability certification.

Start with [production architecture](production-architecture.md), [non-negotiable principles](production-principles.md), [repository audit](current-state-audit.md) and [final report](lp-prod-01-report.md). The earlier [hosting report](../production/lp-prod-01-report.md) remains historical single-instance hackathon evidence; its completion status does not mean this stronger production contract is met.

## Evidence and decisions

- [Database evaluation and POC contract](database-evaluation.md)
- [Tenant model inventory](tenant-model-inventory.md) — all 26 Prisma models
- [Mutation audit](mutation-audit.md) and [controller declaration inventory](mutation-route-inventory.md) — 50 mutation declarations
- [Multi-region and partition behavior](multi-region.md)
- [Write durability, idempotency, audit and outbox](data-durability.md)
- [Object storage, upload and signature integrity](object-storage.md)
- [Backup and recovery](backup-and-recovery.md)
- [Disaster recovery and RPO/RTO limits](disaster-recovery.md)
- [Security and support boundaries](security.md)
- [Tenant isolation and role mapping](multi-tenancy.md)
- [Mobile offline synchronization](mobile-offline.md)
- [Observability and paging](observability.md)
- [Deployment and Render migration](deployment.md)
- [Customer data lifecycle](customer-data-lifecycle.md)
- [Capacity planning](capacity-planning.md) and [cost model](production-cost-model.md)
- [Test strategy](test-strategy.md), [mandatory release gates](release-gates.md), [phased roadmap](production-roadmap.md) and [implementation tickets](implementation-backlog.md)

## Proposed ADRs

1. [Cloud/platform](../adr/0001-production-platform.md)
2. [Multi-region topology](../adr/0002-multi-region-topology.md)
3. [Database strategy](../adr/0003-database-strategy.md)
4. [Object storage](../adr/0004-object-storage.md)
5. [RPO/RTO](../adr/0005-rpo-rto.md)
6. [Transactional outbox](../adr/0006-transactional-outbox.md)
7. [Idempotency](../adr/0007-idempotency.md)
8. [Tenant isolation](../adr/0008-tenant-isolation.md)
9. [Backups](../adr/0009-backup-strategy.md)
10. [Observability](../adr/0010-observability.md)
11. [Deployment](../adr/0011-deployment-strategy.md)
12. [Mobile synchronization](../adr/0012-mobile-offline.md)

No existing ADR template was found in the empty ADR directory. New records use Context, Proposed decision, Alternatives, Consequences, Validation, Rollback and Related design; all remain PROPOSED — REQUIRES POC.

## Proposed operational runbooks

- [Regional failover](../runbooks/regional-failover.md)
- [Database failover](../runbooks/database-failover.md)
- [Database restore](../runbooks/database-restore.md)
- [Object storage recovery](../runbooks/object-storage-recovery.md)
- [Backup restore test](../runbooks/backup-restore-test.md)
- [Write readiness](../runbooks/write-readiness.md)
- [Read-only mode](../runbooks/read-only-mode.md)
- [Bad deployment rollback](../runbooks/bad-deployment-rollback.md)
- [Credential rotation](../runbooks/credential-rotation.md)
- [Incident response](../runbooks/incident-response.md)
- [Customer data recovery](../runbooks/customer-data-recovery.md)

Runbooks define safe actions and evidence but are not immediately executable provider commands: selecting/versioning infrastructure, implementing controls, naming contacts and rehearsing are mandatory ticket acceptance work.
