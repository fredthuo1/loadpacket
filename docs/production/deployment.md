# LoadPacket first deployment — LP-PROD-01

Repository preparation only. No provider is selected or provisioned. Execute these instructions with the operator during LP-PROD-02; do not treat unchecked acceptance as complete.

## Deployment model

Serve the existing Next.js web application and Nest API behind platform/reverse-proxy HTTPS. Mobile clients and web browsers call the same API. The API connects to PostgreSQL and a private persistent filesystem. TLS terminates at the host/proxy; Node listens on the internal HTTP port.

**API replica count = 1.** Disable horizontal autoscaling, scale-to-zero during the demo, and overlapping rolling API instances sharing a filesystem. Use a brief stop/start deployment with the same volume reattached. Web hosting does not receive the document mount. No Kubernetes, queue, object storage or new database abstraction is needed.

The selected provider must support Node 24 or a Linux container, HTTPS/custom domain, protected environment variables, a predictable durable private volume mount, one always-available API, PostgreSQL connectivity, health checks, deployment/restart controls, private logs, volume snapshots/backups and adequate disk capacity. Confirm disk limits and alerting with the host. No vendor ranking is implied.

## Runtime and build

Use **Node 24** and the repository's **pnpm 12.3.4**. The minimum Node engine is >=22.13.0. Verify both commands in the actual build and runtime environment:

```sh
node --version
pnpm exec node --version
```

From the repository root, with the correct environments available:

```sh
pnpm install --frozen-lockfile
pnpm --filter api exec prisma generate
pnpm --filter api build
pnpm --filter web build
```

Prisma generation reads `apps/api/prisma.config.ts` and requires DATABASE_URL but does not migrate. Build web with its final public environment values. API output entrypoint is `apps/api/dist/src/main.js`, not `dist/main.js`. Keep installed production dependencies, generated Prisma runtime code and compiled shared types with the release; do not copy Windows node_modules into Linux.

Run API with working directory `apps/api`:

```sh
node dist/src/main.js
```

Equivalent from root: `pnpm --filter api start:prod`. Run web from root: `pnpm --filter web start --hostname 0.0.0.0 --port 3000`. The web app requires the Next server for auth/proxy behavior; it is not a static export. Preserve its `.next`, public files, configuration and installed dependencies. Never run `next dev` in production. NEXT_PUBLIC values are compiled into the web build; rebuild when they change. Do not set LOADPACKET_AUTH_TEST in deployment.

## Persistent documents — exact path

Recommended deployment contract:

```text
Host/provider durable private volume
    mounted at /data/loadpacket/documents inside the API
    DOCUMENT_STORAGE_ROOT=/data/loadpacket/documents
    relative DB key documents/<document-id>/<version>.pdf
    resolves to /data/loadpacket/documents/<document-id>/<version>.pdf
```

The setting names the **documents directory itself**, not its parent. Mounting a durable volume at `/data/loadpacket` is also valid if `/data/loadpacket/documents` is inside it and DOCUMENT_STORAGE_ROOT points there. No extra `documents/documents` directory should be created.

An alternative absolute mount is supported by setting DOCUMENT_STORAGE_ROOT accordingly. For a deliberate legacy deployment, set it to the absolute `<API working directory>/storage/documents` and mount that directory or its `storage` parent. Do not rely on the container writable layer, temporary disk, public directory, or an automatically created anonymous Docker volume.

Local development with the setting absent/blank continues using `<working directory>/storage/documents`. Production (`NODE_ENV=production`) refuses to start without an explicit absolute directory; filesystem roots and relative paths are rejected. The adapter captures the root once, retains existing relative DB keys and validates every key. All uploads, generated invoices, billing packets, private grants and Broker downloads use this adapter.

Startup creates the directory if necessary and checks read/write/search permissions, logs only the resolved root, and fails with a sanitized configuration error if unavailable. It does not scan, delete, rewrite or populate documents. Permission checks cannot prove that a host path is durable or that a mounted filesystem is healthy under all conditions. **The operator must verify the mount, free space and actual upload/restart/download behavior.** Missing mount at an otherwise writable configured directory cannot be detected portably; do not equate a passing startup check with persistence acceptance.

The container uses UID/GID 1000 (`node`). Provision the mounted directory with access for that identity before startup. Image ownership is hidden by a mount; do not assume it fixes host-volume permissions. New directories use 0700 and new files use 0600 where supported; existing permissions are not changed automatically. Do not grant unrelated users write access or populate document directories with symlinks. Writes remain exclusive (`wx`) and corrections create new versions. Existing transaction compensation can remove only newly written uncommitted files; this is not startup cleanup.

If carrying forward existing test/demo data, stop writes and copy the entire original documents directory with its UUID/version layout into the volume, preserve the matching database, check stored checksums and set ownership. Changing the root does not move bytes. Prefer isolated sanitized demo data; do not reset/reseed operational data or silently create replacement evidence.

## Container option

`infrastructure/docker/api.Dockerfile` is a vendor-neutral Node 24 Linux recipe, built from the repository root. It installs frozen API dependencies, generates Prisma and builds the API; runtime runs as non-root, includes migration tooling, and probes `/api/v1/health`. `.dockerignore` excludes local secrets, private storage/documents, dependencies, generated code and build/test outputs. No runtime secrets are build arguments; no startup migration or seed runs.

Operator commands, **not executed by this ticket**:

```sh
docker build -f infrastructure/docker/api.Dockerfile -t loadpacket-api:<release> .
# The named volume below must already be provisioned/verified by the operator.
docker run --name loadpacket-api --restart unless-stopped \
  --mount type=volume,source=loadpacket-documents,target=/data/loadpacket/documents \
  --env-file /secure/location/api.env \
  -p 127.0.0.1:3001:3001 loadpacket-api:<release>
```

The host may use an equivalent persistent bind/provider mount. Supply DOCUMENT_STORAGE_ROOT in the protected environment. The example binds localhost for a same-host HTTPS reverse proxy; a managed host should route its private service port instead. Never publicly serve the volume. Docker is unavailable on the preparation workstation, so Linux image build/run and mounted UID permissions must be verified on the chosen host before first deployment. No Compose/provider infrastructure is introduced.

## Environment inventory

Store API secrets only in the API host's protected runtime environment. Existing dotenv loading checks the process working directory and then `apps/api/.env`, without overriding already-injected environment variables. Production images exclude dotenv files. Do not put credentials in shell history, images, public build variables or this document.

API values:

- `NODE_ENV=production`; `PORT=3001` or the host's assigned internal port.
- `DATABASE_URL`: PostgreSQL connection with the provider's supported TLS settings and DDL connectivity for the separate migration job. Keep it private; do not disable certificate verification for convenience. The API pool maximum is 5 per process.
- `DOCUMENT_STORAGE_ROOT=/data/loadpacket/documents`: new, required in production; same mount across redeployments.
- `DOCUMENT_DOWNLOAD_SECRET`: existing server-only secret, at least 32 characters, stable across restarts. Supply through the operator's secret manager; this ticket creates none. Rotation invalidates outstanding short grants.
- `SUPABASE_URL`: actual project's HTTPS URL.
- `SUPABASE_PUBLISHABLE_KEY`: intended public/publishable key, also used by the API's legacy JWT verification path when applicable.
- `SUPABASE_SECRET_KEY`: server-only admin credential for the existing invitation adapter (current adapter expects the `sb_secret_` format). Never pass it to clients.
- `WEB_APP_URL`: exact HTTPS web origin for invitation callbacks, e.g. `https://app.example.com`; configure matching Supabase allowed callback URLs externally.
- `CORS_ORIGINS`: comma-separated exact HTTPS browser origins, e.g. `https://app.example.com`. No wildcard, path, trailing slash, credentials or query. Production fails closed if absent/invalid. Local default stays `http://localhost:3000`. Allowed headers remain Authorization, Content-Type and X-Broker-Token with credentials enabled. CORS is not authentication; native clients still require API authorization.
- `DEV_CARRIER_NAME`: existing invoice-renderer fallback name; set the intended demo carrier name if using that invoice path (default is LoadPacket Demo Carrier). Other `DEV_*` bootstrap fields are not request identity and should not be used to seed/reset production as part of deployment.

Web public build/runtime values (same values in both environments):

- `NEXT_PUBLIC_API_URL=https://api.example.com/api/v1` (include `/api/v1`). Missing configuration otherwise falls back to localhost, so verify the compiled build.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the same project as the API.

Mobile public build values (no mobile code changes in this ticket):

- `EXPO_PUBLIC_API_URL=https://api.example.com/api/v1`.
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`: platform **public SDK keys**, never a secret REST key.
- `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` (existing default `pro`).

Supabase SMTP and RevenueCat/store setup remain external. There is no new API SMTP password or RevenueCat secret variable introduced here. Never alias server credentials into NEXT_PUBLIC_* or EXPO_PUBLIC_*. Rebuild public clients after changing their public configuration.

## Migration and safe deployment order

1. Provision database and durable private volume, enable backups, verify database/volume ownership and network access.
2. Configure protected API environment and client public build values. Build immutable release artifacts.
3. In one controlled migration job, from root, run `pnpm --filter api exec prisma migrate deploy`, then `pnpm --filter api exec prisma migrate status`. Supply the intended database connection explicitly. For a container job using the image's API working directory, the equivalent is `pnpm exec prisma migrate deploy`.
4. Start one API instance with the persistent volume attached; keep it private until health/acceptance checks pass. There is no migration or seed in application startup.
5. Check `/api/v1/health` and `/api/v1/health/database` over the chosen routes; start web with the matching public build values.
6. Run the first-deployment checklist and restart-persistence acceptance below, then admit judges/testers.

No schema migration is required by LP-PROD-01. The existing 14 migrations remain the source of truth. Never run `migrate dev`, `migrate reset`, `db push` or seeds as a deployment shortcut. Use a migration-capable provider connection for the release job; the URL variable remains DATABASE_URL, not a newly invented second variable. Stop on migration failure and investigate before starting the new API.

## Health, logging, edge limits and privacy

`GET /api/v1/health` is public, minimal liveness (status/service/time). Storage startup checks finish before the listening server becomes healthy. Liveness does not prove database or ongoing disk health. `GET /api/v1/health/database` runs SELECT 1 and returns a sanitized 503 when unavailable. No filesystem paths or credentials are added to either response.

The API has no public static storage route. Documents continue through tenant/role permissions and existing expiring grants. Broker links retain URL-fragment → X-Broker-Token transport, explicit permissions, selected document types, expiry/revocation and at-most-60-second document grants. No Broker authorization code changed.

Existing application audit logging records actor/organization/action IDs, not headers, passwords or document bytes. The sole added storage log is its safe root. Configure host/proxy logs to omit Authorization, X-Broker-Token, cookies, request/response bodies and invitation/session credentials. Redact or disable access-path logging for `/api/v1/documents/vault-files/*` because existing private download grants are in that path; Broker tokens never belong in URL/query logs. Keep operator logs private. Do not log environment dumps.

No application rate limiter exists. Configure host/reverse-proxy request throttling and connection/body limits for API/auth-facing/public share/download routes before exposing them. Preserve multipart uploads up to the existing 10 MiB file limit plus protocol overhead. Use sensible request timeouts that permit document processing; test at expected demo concurrency. Do not expose `/storage` or the mount through Next.js, a reverse proxy alias or a CDN.

## Backups, restore and rollback

Enable provider PostgreSQL backups and persistent-volume snapshots/backups, with a documented retention and responsible operator. They are **not configured or verified by this ticket**. For a consistent restore point, pause writes and capture both database and document volume; a database-only backup cannot restore evidence. Record release version and environment/mount mapping alongside backup identifiers, without secret values.

Before judging, restore a matching database/volume backup into an isolated environment, verify checksums and authorized reads, and confirm denied cross-tenant access. Do not test restoration by overwriting the live demo.

Rollback to the previous compatible API/web artifact with the same volume and environment. Retain required DOCUMENT_STORAGE_ROOT/CORS settings for this release. Review migration compatibility before rolling application code back; do not automatically undo migrations, remove volumes or restore an older volume alone. Stop writes and plan a coordinated database/volume restore if data recovery is necessary. Preserve backups and original evidence.

## Restart-persistence acceptance (manual, not yet performed on a host)

1. Upload a small non-sensitive test PDF through an authorized account. Record document/version IDs, reported SHA-256 checksum and release/volume identifiers.
2. Download through the existing authorized UI/grant and compare SHA-256 with the original bytes. Verify unauthenticated, cross-tenant and inappropriate-role retrieval fails; no storage path is publicly accessible.
3. Restart the API process, then the container/service with the same volume, and repeat authorized download with a fresh grant. Compare checksum and content each time. Expired grants must still fail.
4. Redeploy the same tested image/release while retaining the volume. Confirm the file, DB version and checksum remain unchanged.
5. Generate a minimally permitted Broker link, open logged out and download only selected evidence. Revoke it; refresh and download must fail. Never record its raw token in acceptance reports.
6. Save tester/date/build, observed outcomes, redacted evidence and persistent-volume configuration in the checklist. A local service-instance test is not a claim that host storage survived these operations.

For local code regression use the existing `pnpm regression:full`; it covers lint/typecheck/tests/builds for API/web/mobile. Do not point fixture tests at the production database or run live/provider actions from the automated gate.
