# First deployment checklist — LP-PROD-02

All items below require external/operator verification and are deliberately unchecked. Follow [deployment.md](deployment.md). Record tester/date, release/image, non-secret resource identifiers and redacted evidence; never paste secrets, bearer links or private documents into reports.

## Before first deployment

- [ ] Hosting provider chosen; Node 24 or Linux container support confirmed.
- [ ] Build and nested `pnpm exec node --version` both use Node 24; frozen dependencies installed.
- [ ] Container image built and tested on Linux if choosing Docker (not verified on the preparation workstation).
- [ ] Production database provisioned; migration job and API connectivity/TLS verified.
- [ ] Database backups enabled with retention/owner recorded.
- [ ] Persistent private volume provisioned with sufficient disk capacity.
- [ ] Volume backups/snapshots enabled with retention/owner recorded.
- [ ] Mount target is `/data/loadpacket/documents` (or documented equivalent); DOCUMENT_STORAGE_ROOT matches exactly.
- [ ] Mounted directory ownership/permissions allow the API identity (Docker UID/GID 1000); no public/static mapping.
- [ ] One API replica; horizontal autoscaling/scale-to-zero/overlapping rollout disabled for the demo.
- [ ] Production API secrets configured outside source/build layers; NODE_ENV=production.
- [ ] Stable document download secret configured (32+ characters).
- [ ] Exact HTTPS WEB_APP_URL and CORS_ORIGINS configured.
- [ ] Web public API/Supabase build variables configured; API URL includes `/api/v1`.
- [ ] Mobile public variables configured; no secret admin/REST keys in public SDK settings.
- [ ] HTTPS enabled and HTTP redirected by the platform/proxy; internal ports restricted.
- [ ] Edge request throttling, connection limits and upload-compatible body limits configured.
- [ ] Logging omits headers, cookies, bodies and private-grant paths; operator logs are private.
- [ ] Existing data, if intentionally carried forward, copied with matching database and verified checksums.
- [ ] `pnpm --filter api exec prisma migrate deploy` run once by controlled release job; migrate status passes.
- [ ] One API instance started with persistent volume; safe root startup log matches intended mount.
- [ ] `/api/v1/health` passes; `/api/v1/health/database` passes without sensitive output.
- [ ] Web starts from production build and reaches API using allowed CORS headers, including X-Broker-Token.

## Before hackathon submission / admitting judges

- [ ] Login and tenant mapping work with intended demo accounts.
- [ ] Real invitation/onboarding verified if part of the demo; Supabase callbacks/SMTP configured externally.
- [ ] Document upload and authorized download work; SHA-256 matches the original.
- [ ] Unauthorized, wrong-tenant and wrong-role document access fail; storage path is not public.
- [ ] Same document survives API restart, container restart and redeployment retaining the volume; checksum matches each time.
- [ ] Broker share permits only chosen data/documents; expired/revoked links and grants fail.
- [ ] Existing full demo workflow works on the deployed release; billing carrier name and sample data are appropriate.
- [ ] Coordinated database + document backup restore tested in an isolated environment.
- [ ] Logs checked without exporting credential/header/body values.
- [ ] Signed-device camera/location/login and sandbox purchase/restore verified if needed for submission.
- [ ] Privacy/Terms/Support, screenshots/artwork and actual hackathon submission requirements checked by operator.
- [ ] Demo uptime, disk headroom and rollback owner confirmed for judging period.

## Acceptance record

Date/tester: NOT_RUN

Release/image and Node versions: NOT_RUN

Host and mount verification (no secrets): NOT_RUN

Upload/restart/redeploy/checksum and authorization evidence: NOT_RUN

Restore evidence: NOT_RUN

Outstanding issues: external provisioning and live acceptance have not been performed by LP-PROD-01.
