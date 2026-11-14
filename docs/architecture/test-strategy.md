# Production qualification test strategy

Status: future tests required, not PASS evidence. Existing regression validates application behavior, not regional durability. Pin source/image/schema/provider configuration and record reproducible synthetic fixtures and expected results.

## Automated local/CI tests

- Functional/API/web/mobile: existing full gate including signature, Finance, Driver, billing and public-grant behavior. Use [isolated Finance wrapper](../../scripts/finance-regression.ps1), not an ambient production DATABASE_URL. POC engines need an explicitly reviewed alternative wrapper because the current wrapper fixes a local PostgreSQL target.
- Security/tenant/IDOR: every route/role/resource relation, public grants, wrong org/Driver, revocation, token expiry, secret redaction and parser input failures; direct database negative tests for composite FKs/RLS and least-privileged pooled roles.
- Concurrency/idempotency: parallel same-key requests, changed payload, account change, retry after expiry/tombstone, duplicate payments/imports/signatures, multiple connections and lost commit ACK. Verify exactly one durable business record with audit/outbox.
- Mobile offline: process kill/reboot, disk full, picker cache eviction, account switch, duplicate reconnect and stale version conflicts. UI must never show submitted before durable status confirmation.
- Outbox/inbox: crash before/after provider response, expired lease, old worker completion, poison event, duplicate webhook and replay; no lost intent, no duplicated financial effect.

## Staging chaos tests (isolated synthetic data)

- Database failover/regional failover/network partition: continuous ledger of client-observed ACK IDs/hashes kept outside the failed region. Kill primary/site, partition minority, exhaust disk, delay commit reply, lose control quorum; check every ACK on surviving authority and zero accepted minority writes. Test graceful switchover and hard regional data loss separately.
- Object failure: lose each store, checksum corruption, absent exact version, one-copy success, scan outage and DB failure after storage. No upload success before two-region receipts and metadata commit; no unsafe orphan cleanup.
- Auth/billing/email outage: expired/uncached auth fails closed, existing valid identity behavior remains explicit, paid Finder unavailable without blocking free work, email intents survive restart and no false delivered acknowledgement.
- Bad deployment: incompatible schema/client, bad image, readiness regression, one-site canary rollback and old-worker fencing. No destructive down-migration.
- Load/soak: twice measured launch peak and 24h representative workload, one-site capacity, reconnect burst, large imports, resource quotas and bounded cross-region transaction retries.

## Manual operational drills

Weekly early-production isolated backup/PITR restoration plus quarterly full failover/partition incident, support access, key recovery and customer-specific recovery. Production-data restore drills require an isolated production-security-class environment and approval, never ordinary developer staging. Verify metadata, exact decimal totals, all restored object checksums, signature binding, audit, authorization and deletion/hold ledger. Exercise pager delivery and escalation, measure end-to-end RPO/RTO, attach evidence and independent reviewer.

## Production-safe synthetics

Approved dedicated synthetic tenant, dummy documents, low rate, normal authorization/durability path; monitor login-independent service liveness and authorized core action separately. Keep customer records untouched. No real purchase/email without explicit synthetic provider setup. Routine synthetics must not inject regional failures or delete customer data. Synthetic cleanup is scoped, audited and policy compliant. No such tests were executed in this documentation task.

## Required evidence

Every run records run ID, environment proof, source digest, engine/adapter versions, topology/policy epoch, failure injection timestamps, independent ACK ledger, expected/actual state, object receipt/hash manifest, first failing stage, durations and reviewer. A test with disabled constraints/checks or a stale replica used as authority is FAIL. Unknown external setup is NOT_VERIFIED, never PASS. Gate IDs and ticket mappings are in [release gates](release-gates.md).
