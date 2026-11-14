# Current infrastructure evidence — LP-PROD-001

As of 2026-10-01. Scope: **repository evidence only**, as instructed by the owner. No provider console, live endpoint, database connection, environment-value inspection or infrastructure mutation was performed. The working tree, including earlier uncommitted implementation, is the reference. This document does not certify which revision is deployed.

## Evidence rules

- **VERIFIED_REPOSITORY / SOURCE:** executable source examined; establishes implemented behavior, not deployed configuration.
- **VERIFIED_REPOSITORY / CONFIG:** checked-in or working-tree configuration examined; establishes intended inputs/defaults, not provider settings.
- **VERIFIED_PROVIDER_READ_ONLY / PROVIDER_READ_ONLY:** would require dated provider evidence. **None collected in this audit.**
- **DOCUMENTED_HISTORICAL / HISTORICAL_EVIDENCE:** earlier report or user statement; not freshly verified.
- **UNKNOWN_REQUIRES_PROVIDER_ACCESS / UNKNOWN:** absent evidence. Neither enabled nor disabled may be inferred.
- **TEST:** a named executed check, with scope and result; documentation tests do not prove service durability.

All proposed controls below are requirements, not current facts. No credential values, connection URLs, tokens or customer contents are needed to close the evidence requests.

## Web

**CONFIG, VERIFIED_REPOSITORY:** [web Dockerfile](../../infrastructure/docker/web.Dockerfile) uses Node 24 bookworm-slim, pnpm 12.3.4, frozen lockfile build, non-root runtime and `next start` on `0.0.0.0`, using `PORT` (default 3000). It does not use standalone output. [Next configuration](../../apps/web/next.config.ts) controls the browser-test output directory. The repository provides a Docker build path, not a deployment pipeline.

**CONFIG:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are required image build arguments compiled into client JS. Changing only container runtime variables will not replace those client values. Public configuration is not a place for server credentials. The API URL must include the API prefix. Actual deployed bundle values were not inspected.

**HISTORICAL_EVIDENCE, DOCUMENTED_HISTORICAL:** previous user-reported Render operation names `loadpacket-web.onrender.com`; see the context recorded in [current-state audit](current-state-audit.md) and [deployment guide](../production/deployment.md). Container publication via GHCR is the requested deployment model, not proof of the currently running image digest or registry.

**UNKNOWN_REQUIRES_PROVIDER_ACCESS:** actual Render service ID, region, plan, replicas, image digest/registry, deployment trigger, custom domain, health-check path, environment ownership and rollback history. No dedicated web health route was found; serving a page is not API/DB/storage readiness evidence.

## API

**SOURCE/CONFIG, VERIFIED_REPOSITORY:** [app module](../../apps/api/src/app.module.ts) is a Nest modular monolith. [Bootstrap](../../apps/api/src/main.ts) provides `/api/v1`, validated inputs, restricted CORS and error handling. [API Dockerfile](../../infrastructure/docker/api.Dockerfile) starts one Node process with `node dist/src/main.js`, non-root, `PORT` default 3001, no migration on start. That process model does **not** establish a provider replica count.

The container creates `/data/loadpacket/documents`; the operator must mount persistent storage and set `DOCUMENT_STORAGE_ROOT`. There is no declared anonymous volume. The configured live mount/path/disk count and persistence across replacement are **UNKNOWN**. The Docker health check requests `/api/v1/health`; `/api/v1/health/database` also exists. See [health evidence](current-health-model.md).

**HISTORICAL_EVIDENCE:** user-reported Render API URL `loadpacket-api.onrender.com/api/v1`. **UNKNOWN:** service ID, actual region/replicas, deployed revision/digest, mount, deployment source, container health override and restart behavior. No claim of one deployed API instance or one deployed region is justified by repository evidence alone.

## Database and connection path

**SOURCE/CONFIG, VERIFIED_REPOSITORY:** [schema](../../apps/api/prisma/schema.prisma) uses PostgreSQL; [package](../../apps/api/package.json) pins Prisma/client 7.10.0. [PrismaService](../../apps/api/src/database/prisma.service.ts) uses PrismaPg and the server-only `DATABASE_URL`. Each process requests a pool maximum of 5, 5-second connection timeout and 30-second idle timeout. These are client settings, not the server connection limit.

[Prisma config](../../apps/api/prisma.config.ts) also uses `DATABASE_URL`. There is no separately named migration URL/role in that config. Runtime and migration identities could still differ by process environment. Their actual names, ownership and permissions are **UNKNOWN**. Source does not set an explicit TLS option or global transaction isolation level; effective TLS/certificate validation, server isolation and synchronous commit must be verified externally. Never infer them by reading a local development connection string.

**HISTORICAL_EVIDENCE:** earlier development/test foundation and migration reports refer to Supabase-backed PostgreSQL. This does not establish the provider of the current production DB. **UNKNOWN_REQUIRES_PROVIDER_ACCESS:** live DB provider/project, engine version, direct versus pooler route, pooler mode, connection cap, region, writer/replica placement, synchronous settings, failover contract, backup/PITR and applied migration history. The repository has 17 migrations; none was run or queried here. See [privileges and compatibility](database-compatibility-inventory.md).

## Mobile, identity and billing

**CONFIG, VERIFIED_REPOSITORY:** [Expo app](../../apps/mobile/app.json) declares owner `thuofred1`, slug `loadpacket-driver`, EAS project `24843f19-db3f-44b3-b6b5-250ba4f1d433`, iOS/Android identifier `com.loadpacket.driver`. These are non-secret configuration identifiers, not proof of current account access or ownership. [EAS profiles](../../apps/mobile/eas.json) define development, preview and production builds.

**SOURCE:** [mobile auth](../../apps/mobile/src/auth/supabase.ts) consumes `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; SecureStore persists native sessions. Public Expo variables are bundle inputs; the installed production artifact's actual API target/build ID is **UNKNOWN**, as are TestFlight/store publication and signing custody. [API client](../../apps/mobile/src/api/client.ts) has request deadlines and one auth refresh, not a durable offline mutation queue.

**SOURCE:** [auth module](../../apps/api/src/auth/auth.module.ts), [token verifier](../../apps/api/src/auth/supabase-token-verifier.ts) and [auth service](../../apps/api/src/auth/auth.service.ts) bind verified Supabase identity to an active application User, organization, role and Driver mapping. Tokens alone do not supply trusted tenant authorization. Server identity administration uses the [Supabase adapter](../../apps/api/src/integrations/supabase); public client keys are distinct from server credentials. Project settings, allowed callbacks, MFA, service-key custody and Auth recovery are **UNKNOWN**.

**SOURCE:** [RevenueCat native adapter](../../apps/mobile/src/subscriptions/native.ts) and [subscription service](../../apps/mobile/src/subscriptions/service.ts) use the stable application user ID, purchases/restore/customer-info refresh and a public platform SDK key. Test Store use is development-gated. No server subscription persistence model, RevenueCat webhook/controller or billing worker was found in the API/schema. Current project/store/entitlement settings and actual purchase acceptance are **UNKNOWN**. An SDK integration is not provider acceptance evidence.

## Documents, workers, cache and email

**SOURCE:** [DocumentsModule](../../apps/api/src/documents/documents.module.ts) binds `DocumentStorage` to `LocalDocumentStorage`. [Adapter](../../apps/api/src/documents/document-storage.ts) resolves an absolute production root, strips the `documents/` key prefix and stores `<root>/<document UUID>/<version-or-UUID>.<extension>`. Development defaults to `<cwd>/storage/documents`. Directory/file modes are 0700/0600, writes use exclusive `wx`, and startup checks access. These checks cannot distinguish a mounted durable disk from a writable ephemeral directory. No explicit fsync, object-store adapter, independent regional receipt or storage failover implementation exists here.

DocumentVersion stores SHA-256 and a new version/key for corrections; signature PNGs and generated invoices use the same storage abstraction. Downloads are authorized/temporary, not permanent public URLs. Finance import originals are an exception: `FinancialImportBatch.fileBytes` lives in the database. Recovering SQL alone does not restore local document/signature/invoice bytes. See [backup evidence](current-backup-evidence.md) and [object POC](object-storage-poc-plan.md).

**SOURCE/CONFIG:** no implemented `apps/worker`, deployed-worker manifest, queue broker, Redis business cache, transactional outbox or durable inbox was found. Extraction and invitation work run in API requests; payment-readiness queues are database/UI queries. JWKS and SDK caches exist but are not a production message queue. Any manually created external worker/cache is **UNKNOWN_REQUIRES_PROVIDER_ACCESS**.

**SOURCE:** [driver invitations](../../apps/api/src/drivers/driver-invitation.service.ts) call the Supabase identity adapter for invite/resend inside a DB transaction. The actual outbound SMTP/email provider, domain, quotas and delivery recovery are **UNKNOWN**; Supabase is the integration path, not evidence of a configured SMTP vendor.

## Tenant isolation baseline and later priorities

**SOURCE:** all 25 tenant-owned models carry organizationId; Organization is the root. The [26-model inventory](tenant-model-inventory.md) and [mutation audit](mutation-audit.md) remain the detailed baseline.

1. Controller: global bearer authentication, invitation and deny-by-default role guards; DTO validation; explicit public exceptions for health/grant routes.
2. Service: authenticated organization filters, driver/assignment ownership and private document authorization. Finance is OWNER/BACK_OFFICE with additional OWNER restrictions. No universal tenant-scoped repository wrapper was found; services call Prisma directly.
3. Prisma query: explicit tenant predicates and tenant-filtered parent reads protect nested relations. The ORM does not automatically inject organizationId. Regressions in an individual query could bypass this layer.
4. Foreign keys: newer vault/payment/Finance/signature relations use tenant composites. Legacy ID-only edges include assignment→load/driver, documentVersion→document, stop→load, loadDocument→load/document, requirement→load, event→load, chargeOpportunity→load/sourceDocument, agreement→load, agreementVersion→agreement/sourceVersion, acceptance→agreementVersion and externalAccess→load/agreement. A bare ID FK proves existence, not tenant equality.
5. RLS: migrations enable RLS and revoke public `anon`/`authenticated` access; source does not define runtime tenant policies or FORCE RLS. Applied policy state and app-owner/BYPASSRLS behavior are unknown. This is a Data API denial boundary, not proof of database-enforced runtime tenant isolation.

**Proposed, LP-PROD-008/023 priorities:** P0 establish actual roles and catalog evidence; separate non-owner runtime from migration/admin authority; add tenant-composite legacy FKs only after an approved inconsistency audit and explicit repair plan; test cross-tenant direct SQL and API access; qualify engine-specific RLS/transaction-local context with pool reuse. P0 protect evidence/Finance/audit UPDATE and DELETE including cascades, retaining legitimate adjustment/reversal semantics. P1 verify tenant-first indexes and least-privileged support/reporting roles. No policy or constraint was changed here.

## Evidence requests to close the baseline

Responsible roles are recommendations; **named owners remain unassigned**. Platform owner: service IDs/regions/replicas/image digests, disks/mounts, registry and DNS. Database owner: redacted engine/roles/ownership/TLS/replication/backup catalog. Security owner: admin roster, MFA/recovery and backup account/key separation. Mobile owner: EAS/Apple build and embedded public endpoint attestation. Integration owner: Supabase SMTP and RevenueCat project/store mappings. Each result needs date, environment ID, collector, redacted evidence and reviewer. Repository-only authorization defers these checks; it does not turn them into PASS.
