# LP-PROD-01 — Hosting readiness report

Date: September 25, 2026 (America/Chicago; test artifacts use September 26 UTC).

Status: **LP-PROD-01 COMPLETE; ready to start LP-PROD-02 with the operator.** The final automated gate passed all 22 checks. Repository preparation only; no production deployment or external configuration action has been performed. Docker/host/native acceptance remains explicitly unverified.

## Repository findings

The modular Nest API, Next web app and Expo Driver app already implement the demo workflow. One existing DocumentStorage adapter serves every persisted upload, private retrieval, Broker download, invoice and billing packet. Before this ticket it resolved `process.cwd()/storage/<relative key>`, with no configurable root/startup check. Database keys use `documents/<UUID>/<version>.pdf|jpg|png`; absolute filesystem paths are not stored. Parent directories were created on write; `wx` already prevented overwrite.

Authorization stays in existing services: tenant and office/Driver permissions, private grants, and Broker permissions/revocation/expiry. There is no static storage exposure or startup cleanup. Transaction compensation can remove a new uncommitted file. No Dockerfiles, Compose setup or CI pipeline were present; infrastructure directories were empty. PostgreSQL configuration and migration files already exist; all 14 migrations were applied at inspection.

## Changes and configuration

LocalDocumentStorage now resolves/captures a configured root once, preserving all relative keys. New `DOCUMENT_STORAGE_ROOT` is optional in development (same default), required and absolute in production. Relative paths/filesystem roots are rejected. The exact recommended production mount and setting are **`/data/loadpacket/documents`**; keys omit their `documents/` prefix when mapped into that root. Existing data must be copied intact by the operator if the mount changes; the setting does not move files.

Startup ensures the directory exists and checks read/write/search access. It creates no probe documents, clears nothing and logs only the safe root in production. Invalid/inaccessible directories fail startup with a sanitized error. Exclusive writes and key validation are preserved; newly created directories/files use private 0700/0600 modes where supported. A writable configured path cannot prove a real volume is attached; mount durability, ownership, disk capacity and restart acceptance remain external.

CORS now rejects missing production origins, wildcards, credentials, paths, queries and non-HTTPS production origins. The development localhost default and Authorization/Content-Type/X-Broker-Token headers remain. Existing health endpoints are unchanged: minimal public liveness and a sanitized SELECT 1 database check. API port/TLS architecture is unchanged.

The vendor-neutral API Dockerfile uses Node 24 Debian, frozen pnpm 12.3.4 dependencies, Prisma generation and the existing compiled entrypoint. Runtime is non-root UID/GID 1000 with an HTTP liveness probe. It retains migration tooling for a separate release job. There is no default storage path hiding a missing environment setting, anonymous volume, startup seed or migration. `.dockerignore` excludes local env/secrets/private files and build artifacts. Docker image build/run is **NOT_RUN** because Docker is unavailable on this workstation; verify it on the selected host before use. Native Node hosting remains an alternative documented path.

The deployment guide documents single-replica operation, exact environment names, HTTPS, edge throttling, snapshots/backups, coordinated restore, rollback and a checksum-based restart/redeploy acceptance procedure. Operator checklist items remain unchecked. Prior readiness/matrix storage wording now reflects this single-instance hackathon scope.

## Files created

- `.dockerignore`
- `infrastructure/docker/api.Dockerfile`
- `apps/api/src/common/cors-config.ts`
- `apps/api/src/common/cors-config.spec.ts`
- `apps/api/src/documents/document-storage.spec.ts`
- `docs/production/deployment.md`
- `docs/production/first-deployment-checklist.md`
- `docs/production/lp-prod-01-progress.md`
- `docs/production/lp-prod-01-report.md`

## Files modified

- `apps/api/src/documents/document-storage.ts`
- `apps/api/src/documents/vault.spec.ts` (existing exclusive-write assertion now also checks 0600 mode)
- `apps/api/src/main.ts`
- `apps/api/.env.example`
- `docs/release-readiness.md`
- `docs/regression-scenario-matrix.md`
- `apps/mobile/package.json`
- `pnpm-lock.yaml`

These are ticket changes, not a claim that the much larger pre-existing dirty workspace was created here. No commit, reset, seed, migration edit, push or deployment occurred.

## Dependencies and release-verification blocker

No direct dependency was added or removed. The first full gate failed because Expo's online version map changed after the preceding sprint: it recommended five newer patches. An offline check reported itself unreliable and was not accepted as a successful release gate. Under this ticket's explicit exception for failures blocking release verification, only the following direct versions and necessary transitive lockfile resolutions were updated:

- expo 57.0.24 → 57.0.25
- expo-image-picker 57.0.19 → 57.0.20
- expo-linking 57.0.10 → 57.0.11
- expo-location 57.0.19 → 57.0.20
- expo-router 57.0.22 → 57.0.23

Expo's online compatibility check now passes. No SDK-major, React, React Native or unrelated tooling upgrade was made. `pnpm peers check` still exits 1 for Metro config (installed 0.87.1, community CLI peer wants 0.86.3) and worklets (installed 0.13.0, expo-modules-core peer range ends at ^0.10.0). These diagnostics are recorded rather than hidden or addressed through an unrelated dependency redesign. Native signed-device acceptance remains mandatory; successful bundles alone do not establish it.

## Commands and actual validation

Initial elevated `node --version` and `pnpm exec node --version`: **v20.19.0 / v20.19.0**. The sandbox's bundled Node was v24.19.0. Validation used a command-scoped PATH prefix to that existing runtime; both commands then returned **v24.19.0 / v24.19.0**, pnpm **12.3.4**. No machine-wide runtime setting was modified.

PowerShell validation prefix used locally:

```powershell
$env:PATH='C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;'+$env:PATH
```

Executed:

- `git status --short`, source/config/cleanup/logging searches and existing checkpoints/matrix reads.
- `pnpm --filter api exec prisma migrate status`: PASS, 14 migrations applied; no migration executed.
- `docker --version`: unavailable (command not installed).
- Scoped Prettier on the five changed/new API implementation/test files; no repository formatting.
- `pnpm --filter api test --runInBand document-storage.spec.ts cors-config.spec.ts`: PASS, 13 focused cases.
- `pnpm --filter api typecheck` and scoped ESLint on those files: PASS.
- First `node scripts/release-gate.cjs --scope=full`: FAIL at Expo compatibility, artifact `test-results/regression/2026-09-26T02-23-44-006Z/results.json`.
- Temporary `EXPO_OFFLINE=1` Expo compatibility diagnostic: explicitly unreliable, not accepted; no persistent offline setting changed.
- `pnpm --filter mobile add expo@~57.0.25 expo-image-picker@~57.0.20 expo-linking@~57.0.11 expo-location@~57.0.20 expo-router@~57.0.23`: PASS; lockfile updated. Commands used the existing pnpm store and disabled its pre-run dependency verification to avoid the known Windows store conflict.
- Online `pnpm --filter mobile exec expo install --check`: PASS. `pnpm peers check`: two unresolved diagnostics noted above.
- Second `node scripts/release-gate.cjs --scope=full`: FAIL at API unit tests, artifact `test-results/regression/2026-09-26T02-26-20-638Z/results.json`. All preceding mobile/Expo/bundle/Prisma/API static/build checks passed. One existing mock expected only wx and needed to assert the added 0600 mode. Fixed the assertion; targeted `vault.spec.ts` passes both tests. No test disabled or security behavior relaxed.
- Final full gate: **PASS, 22/22 checks**, Node 24 and `RUN_MOBILE_DATABASE_TESTS=1`, without an offline override. Artifact: `test-results/regression/2026-09-26T02-29-33-147Z/results.json` and `results.md`; elapsed 164.88 seconds. No Node 20 deprecation message occurred in the final logs.

Final lint: API, web and mobile PASS. Final typecheck: API, web and mobile PASS. Tests: **88 API unit, 218 API HTTP, 26 browser, 16 mobile, 6 secret-audit tests PASS**, plus isolated real database integrity/concurrency PASS. Builds: API and Next production build PASS; Android/iOS JavaScript/Hermes exports PASS. Prisma validation/generation/migration status and Expo online compatibility/public config PASS. Source/build secret audit PASS. Docker image build/native installation remain NOT_RUN, distinct from successful application builds.

The existing full gate runs the repository equivalents of lint, typecheck, unit/HTTP/browser/mobile tests and builds directly for each app, plus Prisma/Expo/security checks. Root Turbo aliases were not redundantly rerun. Detailed command arguments, exit codes and logs are in its JSON/Markdown report. Fixtures use isolated test tenants, not production migration/reset operations.

Tests added cover development default, absolute configured path independent of working directory, missing/invalid production root, immutable writes, fresh-instance persistence with no startup artifacts, traversal/absolute-key rejection, blocked-directory startup and safe CORS origin parsing. Existing authorization/Broker/document regressions are retained unchanged.

## Security and operational findings

No concrete Authorization/token/password/document-byte logging was found in the reviewed application logging. Existing audit records use internal actor/tenant/action identifiers; no Broker code was changed. Public browser/mobile environment boundaries and existing secret audit remain. Runtime server credentials must never be copied into NEXT_PUBLIC or EXPO_PUBLIC values. The production guide explicitly requires host/proxy header/body/cookie redaction and redaction of existing private-grant URL paths; the repository cannot enforce an external host's log configuration.

No rate-limiting platform was added. Edge throttling/body limits, HTTPS, durable mount/ownership, database and volume backups remain external requirements. Health liveness does not prove ongoing database/disk durability. The API must remain a single always-available instance for judging; do not autoscale filesystem replicas.

## Database migration procedure

No new schema migration. With the intended protected DATABASE_URL and database reachable, run `pnpm --filter api exec prisma migrate deploy` once as a controlled release step, then `pnpm --filter api exec prisma migrate status`. Start API only after success, with its private volume attached; verify both health endpoints, then web and authenticated smoke tests. Startup never migrates. No real production migration was run in this ticket.

## Required before first deployment

Choose the provider interactively in LP-PROD-02. Provision database, private persistent volume and both backup mechanisms; verify ownership/disk capacity, one API instance, HTTPS/private networking, secrets, exact CORS/web origins and correct public client builds. Build/test the Linux image if using Docker, run controlled migrations and health checks, configure throttling/log redaction, then perform the deployment checklist. These are operator deployment actions, not missing feature architecture.

## Required before hackathon submission

Verify real deployed login, authorization and complete demo workflow; upload/download and checksum equality through API restart, container restart and retained-volume redeployment; Broker selection/revocation; coordinated backup restore in isolation. Complete external Supabase invitation setup, signed-device testing and RevenueCat sandbox acceptance where required by the intended demo/submission, plus approved privacy/support/materials. Actual hackathon eligibility rules have not been supplied; the operator must verify them rather than assume store publication is required.

## Post-hackathon

Object storage, horizontal scaling, distributed filesystems, Kubernetes, advanced observability and IaC expansion are not blockers for this single-instance demo. Existing deferred detention-to-invoice automation and Broker acceptance/signatures remain outside this hosting ticket. Reassess storage/runtime dependency diagnostics and scaling only with concrete requirements.

## Remaining risks and next action

No production mount, backups, HTTPS host or native runtime has been verified. Docker build/run remains unverified locally. The added storage checks do not detect a forgotten mount at a writable path or eliminate disk exhaustion/host failures. Record those checks before exposure. Two mobile peer diagnostics remain; Expo's online compatibility and bundle checks pass, but signed-device acceptance must verify actual native behavior. Repository work stops here; choose/provision the host and execute the unchecked checklist interactively in LP-PROD-02.

READY_FOR_LP_PROD_02: YES
