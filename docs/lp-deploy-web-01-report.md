# LP-DEPLOY-WEB-01

Status: IMPLEMENTED; Docker build/container/image validation BLOCKED because Docker is not installed on this workstation.

## Artifact and scope

Added `infrastructure/docker/web.Dockerfile`. Retains the existing `next build` / `next start` model; standalone output is unnecessary and would change Next configuration and monorepo tracing. Shared imports are declaration-only files in `packages/api-contracts`, copied for the build. No runtime shared-package service is needed.

Uses Node 24 bookworm-slim, pnpm 12.3.4, repository-root build context, frozen lockfile and in-image pnpm dependency links. The runtime retains the installed web/build dependencies to support the existing TypeScript Next config without dependency pruning or application changes. This favors minimal deployment changes over minimum image size. It runs as `node`, with writable `.next`, binds `0.0.0.0`, and reads `PORT` at startup (default 3000). The empty current public directory is created in the builder so a fresh checkout also works.

Only this report and the new web Dockerfile were added. API Dockerfile, application source/config, manifests, pnpm lockfile, mobile and database are unchanged. Existing generated web build/typecheck outputs were refreshed. No deployment, registry push, commit, provider work or migration occurred.

## Public configuration and security

All three `NEXT_PUBLIC_*` variables are mandatory **build arguments**, supplied to `next build` and inlined into browser/server bundles. Changing only Render runtime environment variables will not replace the compiled browser configuration; rebuild the image for another environment. `PORT` is runtime configuration.

The existing root `.dockerignore` excludes `.env`, `.env.*`, storage, credentials/private-key patterns, local dependencies and generated builds. The runtime stage explicitly copies dependency directories, web package/config, `.next` and public assets; it does not copy the app source directory, `.env.local`, API, private documents or database configuration. No server-only Supabase or database variable is accepted by this Dockerfile. Supply only the public Supabase publishable key, never a server/admin key. Build arguments and browser bundles are not secret storage.

Static inspection passed, and the safe fictional public settings were confirmed in the local browser bundle without printing values. **No final Docker image exists here, so image filesystem/config/history inspection remains unverified.** The local non-container Next build loaded the existing `.env.local` filename, with all three intended public settings overridden by fictional process values. This does not prove Docker exclusion; Docker exclusion is currently supported by the ignore/copy-rule review only.

## Validation

- Web typecheck: PASS.
- Web lint: PASS.
- Web production build: PASS using safe local public configuration, not production values.
- Non-container production smoke: PASS, `/login` HTTP 200, unauthenticated `/finance` redirected to login. Used an unused loopback port with runtime `PORT`; stopped the exact child process afterward. No authentication or external API operation was performed.
- Build-time public-variable inlining: PASS for all three values (presence-only checks).
- `git diff --check`: PASS; new Dockerfile whitespace check PASS.
- Protected manifest/config/API Dockerfile/lockfile fingerprints: unchanged.
- Docker availability: FAIL (`docker` command not found; standard installation paths absent).
- Docker build, container start/HTTP/cleanup, final image secret inspection: NOT_RUN — Docker unavailable. No container was created.

## Production command templates — not executed

Run from the repository root with Docker available. Replace `RELEASE_TAG` and `GHCR_OWNER` (lowercase registry owner). Set the three named variables in the build shell to the approved deployed HTTPS API URL including `/api/v1`, public Supabase URL and public publishable key. Commands pass their values from the environment without including values in the command text. Local smoke-test URLs are not production configuration.

PowerShell:

```powershell
docker build --platform linux/amd64 `
  -f infrastructure/docker/web.Dockerfile `
  --build-arg NEXT_PUBLIC_API_URL `
  --build-arg NEXT_PUBLIC_SUPABASE_URL `
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY `
  -t loadpacket-web:RELEASE_TAG .

docker tag loadpacket-web:RELEASE_TAG ghcr.io/GHCR_OWNER/loadpacket-web:RELEASE_TAG
docker push ghcr.io/GHCR_OWNER/loadpacket-web:RELEASE_TAG
```

Tag/push commands are templates only. No registry login or push was performed. On a Docker-equipped machine, validate the image and run it on an unused loopback host port before any publication. Check HTTP response, runtime `PORT` override, non-root user, and absence of local environment/private credential files without dumping environment values or bundles; then stop/remove only that validation container. Resolve these Docker-only checks before treating the artifact as deployment-verified.
