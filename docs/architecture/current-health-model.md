# Current health model — LP-PROD-001

Evidence: SOURCE/CONFIG, inspected 2026-10-01. No live requests were made. [AppController](../../apps/api/src/app.controller.ts), [bootstrap](../../apps/api/src/main.ts) and [API Dockerfile](../../infrastructure/docker/api.Dockerfile) are authoritative for the implemented paths below. Render's configured probe remains UNKNOWN.

## Implemented

`GET /api/v1/health`: public controller returns `status: ok`, service and timestamp. It proves that this request reached a functioning handler. No per-request database, filesystem, replication, backup or dependency test occurs. The API Dockerfile uses this endpoint every 30 seconds with a 5-second timeout, 30-second start period and three retries.

`GET /api/v1/health/database`: public handler awaits `SELECT 1`; success reports `database: postgresql`, failure returns a sanitized 503. The label is a static string, not a detected server version/provider. It verifies SQL connectivity on one connection only: not tenant permissions, migrations, write commit, synchronous replication, regional quorum, storage or backups.

Startup connects Prisma and initializes the local storage directory/access check. Successful startup cannot establish that storage is persistent or that a later write is safe. Docker process health can remain green while dependencies fail.

`/api/v1/health/live`, `/api/v1/health/ready`, `/api/v1/health/write-ready`: **not implemented** in the reviewed controller. Unprefixed paths are not equivalent under the configured `/api/v1` prefix. No dedicated web health endpoint was found. A Next page response proves only that page-serving path.

## Future contract — not implemented

- **live:** process/event loop able to respond. Never restart a healthy process merely because a shared dependency is down.
- **ready:** this instance has compatible schema/config, validated identity configuration, available required read dependencies and correct routing role. Remove it from normal serving on failure while preserving a truthful maintenance/read-only route if supported.
- **write-ready:** an operation-specific decision requiring authoritative DB commit path, verified regional quorum/strict-sync policy and fencing epoch; appropriate remote object destinations and scanner for evidence writes; usable audit/outbox transaction path and capacity. Quorum unavailable or fencing stale means no new authoritative writes.

Readiness telemetry is not commit authority: the database/storage protocol must enforce the contract at the actual write. A cached green probe cannot authorize a write after topology changes. Use strong reads for permission/Finance decisions. Never write synthetic customer records to production to implement this probe.

Required future signals: replication placement/flush or quorum evidence and freshness; promotion/fencing state; role/isolation/schema compatibility; pool saturation/timeouts and serialization retries; receipt checksum/region/version verification; quarantine/scanner status; outbox lag; backup/PITR freshness and independent restore age. Backup failure must alert and follow an explicit risk policy; it must not be falsely represented as database connectivity failure. Auth/email/RevenueCat health affects their operations, not automatically all free freight work.

**Pre-mutation rejection:** 503 with a safe retry indication may say no changes were accepted only when that is known. **After uncertain commit:** use a future durable operation ID/status lookup and `UNKNOWN_OUTCOME`; do not tell a client to create a new operation or delete its evidence. Current API/mobile generic error handling lacks this universal distinction. See [write paths](current-write-paths.md), [write readiness runbook](../runbooks/write-readiness.md) and LP-PROD-004/006/007.
