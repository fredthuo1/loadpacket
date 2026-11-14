# Current single points of failure — LP-PROD-001

2026-10-01, repository evidence only. Entries are **verified application/reference-design dependencies**, not inferred deployed instance or region counts. Provider redundancy could mitigate some failures; its presence is UNKNOWN. Priority reflects customer impact, not evidence that an outage has happened.

## SPOF-01 — Local document destination

- **COMPONENT:** the single `LocalDocumentStorage` root bound in [DocumentsModule](../../apps/api/src/documents/documents.module.ts). Evidence: SOURCE.
- **FAILURE:** unavailable or lost filesystem destination; no application alternate store/receipt exists.
- **CUSTOMER IMPACT:** upload, document retrieval, signatures and billing evidence unavailable even if SQL survives.
- **DATA-LOSS RISK:** acknowledged bytes may be unrecoverable; actual disk persistence/backup unknown.
- **CURRENT PROTECTION:** SHA-256, private paths, exclusive writes, version rows, conservative ambiguous-commit cleanup; no independent durable copy proof.
- **TARGET PROTECTION:** two regional immutable receipts before authoritative ACK, independent recovery archive, reconciled restore.
- **PRIORITY:** P0; LP-PROD-005/009.

## SPOF-02 — Configured database authority

- **COMPONENT:** one database connection configuration in [PrismaService](../../apps/api/src/database/prisma.service.ts). Evidence: SOURCE/CONFIG. The endpoint may front HA; number of DB writers/nodes/regions is unknown.
- **FAILURE:** configured database authority cannot serve safe reads/commits.
- **CUSTOMER IMPACT:** authenticated tenant mapping and authoritative load/Finance operations fail.
- **DATA-LOSS RISK:** unknown underlying replication/backup contract; source cannot establish survival of acknowledged commits.
- **CURRENT PROTECTION:** transactions, constraints/locks, pool/timeouts, sanitized DB health failures. No application proof of remote durability or fenced failover.
- **TARGET PROTECTION:** qualified single logical authority with strict remote durability or regional quorum, fenced promotion and independent restore.
- **PRIORITY:** P0; LP-PROD-002/004/009.

## SPOF-03 — Supabase identity integration

- **COMPONENT:** sole implemented token/identity provider. Evidence: [SOURCE](../../apps/api/src/auth/supabase-token-verifier.ts).
- **FAILURE:** provider unavailable, project inaccessible or identity/recovery administration lost.
- **CUSTOMER IMPACT:** new login, refresh and invitations fail; some existing signed tokens may validate using cached keys until expiry/cache needs refresh. Do not promise uninterrupted sessions.
- **DATA-LOSS RISK:** no direct loss of freight SQL/files inferred; access/recovery disruption is material.
- **CURRENT PROTECTION:** JWT verification and limited JWKS cache, stable app mapping; no second identity/recovery integration.
- **TARGET PROTECTION:** vendor continuity evidence, protected independent recovery custody, tested outage behavior and safe existing-session policy.
- **PRIORITY:** P0 continuity qualification; no auth redesign authorized.

## SPOF-04 — Invitation delivery path

- **COMPONENT:** Supabase invite/resend path inside [invitation transaction](../../apps/api/src/drivers/driver-invitation.service.ts). Evidence: SOURCE.
- **FAILURE:** provider timeout or delivery ambiguity around DB commit.
- **CUSTOMER IMPACT:** Driver onboarding blocked or requires manual reconciliation; a provider action cannot be rolled back atomically with SQL.
- **DATA-LOSS RISK:** ambiguous external side effect/mapping rather than proven loss of freight data.
- **CURRENT PROTECTION:** driver locks, mapping checks, resend throttle and cautious compensation; SMTP provider/delivery backup unknown.
- **TARGET PROTECTION:** durable intent/outbox plus provider reconciliation, operator runbook and recovery ownership.
- **PRIORITY:** P0; LP-PROD-007.

## SPOF-05 — Paid mobile entitlement dependency

- **COMPONENT:** RevenueCat SDK as sole implemented entitlement path. Evidence: [SOURCE](../../apps/mobile/src/subscriptions/service.ts).
- **FAILURE:** customer-info/purchase service unavailable or account access lost.
- **CUSTOMER IMPACT:** paid Finder access/purchase verification unavailable; core load/document operations are separate.
- **DATA-LOSS RISK:** no authoritative logistics DB loss inferred; purchase outcome must be refreshed/reconciled.
- **CURRENT PROTECTION:** failure locks entitlement; refresh/restore and stable identity; actual store recovery settings unknown.
- **TARGET PROTECTION:** provider/store recovery evidence and native outage/restore tests; server billing only under later approved scope.
- **PRIORITY:** P1 for paid benefit availability; launch/store acceptance separately required.

## Not asserted as verified SPOFs

One API replica, one web replica, one deployed region, one physical disk, one DB writer, one shared admin, one DNS control plane and one backup account are **UNKNOWN**, not verified register entries. A single configured filesystem path is confirmed; its physical backing is not. No independent worker/queue deployment was found, so no imaginary queue outage is registered. Close these questions with the redacted evidence requests in [infrastructure evidence](current-infrastructure-evidence.md) and [admin domains](administrative-failure-domains.md).
