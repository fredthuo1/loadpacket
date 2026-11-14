# LP-RELEASE-FINAL — Release execution checkpoint

Updated: September 29, 2026.
Status: BLOCKED_EXTERNAL — Phase 3, select/access the API hosting target.

## Verified this run

- Read release brief and engineering rules; existing workspace changes preserved.
- Node and pnpm Node both return **v24.19.0** using the documented bundled runtime.
- `pnpm dlx eas-cli whoami` stopped on `ERR_PNPM_IGNORED_BUILDS`. No build-script approval settings or project dependencies changed.
- Previously verified fallback: `npm exec --yes --ignore-scripts --package=eas-cli@24.8.0 -- eas whoami` returned **Not logged in**.
- Browser login completed; terminal session 35519 exited successfully. A fresh `whoami` confirms **thuofred1**.
- Initially, `project:info` confirmed no project binding. Local app identity remains `LoadPacket Driver`, slug `loadpacket-driver`, bundle `com.loadpacket.driver`.
- Listed all projects in `thuofred1` using the installed EAS client's authenticated read-only API: exactly one existing unrelated wellness app, no further pages, no LoadPacket project. Did not alter or link that unrelated project. Browser automation was unavailable; the CLI API supplied the inventory.
- Fredrick explicitly approved creation. Created and linked **@thuofred1/loadpacket-driver**, confirmed remotely by `project:info`.
- Project ID: **24843f19-db3f-44b3-b6b5-250ba4f1d433**. Project URL: https://expo.dev/accounts/thuofred1/projects/loadpacket-driver.
- `npm exec` incorrectly consumed EAS init flags; it made no project change. Running the cached official CLI directly succeeded. Subsequent CLI operations should use Node 24 plus `C:/Users/User/AppData/Local/npm-cache/_npx/cdcf29a1293ceb8d/node_modules/eas-cli/bin/run` while that installation exists.
- `apps/mobile/app.json` now contains owner `thuofred1`, `extra.eas.projectId`, and CLI-generated `extra.router: {}`. Public Expo config resolves successfully; name, slug, scheme, bundle/package, version and initial build number remain unchanged.
- Inspected the existing deployment runbook, Dockerfile, provider-config filenames, Git remotes and sanitized public endpoints. Repository has a vendor-neutral Node 24 Dockerfile, no selected provider/configuration, no Git remote, and only localhost API/web origins. No public API target can yet be verified. Stop for hosting selection/access as required by the brief.

## Release state

- EAS account: AUTHENTICATED — `thuofred1`.
- EAS project: CREATED / LINKED / VERIFIED — `@thuofred1/loadpacket-driver`, ID `24843f19-db3f-44b3-b6b5-250ba4f1d433`.
- Bundle: `com.loadpacket.driver`; version `1.0.0` from the existing checkpoint; unchanged.
- HTTPS test API / external health / iPhone reachability: BLOCKED_HOSTING_TARGET; current endpoints remain localhost only.
- Hosted web / judge access: NOT_VERIFIED.
- Supabase/mobile public build environment: UNVERIFIED; inspect names and key classes only after authentication and project/API selection.
- RevenueCat / App Store Connect / current offering: UNVERIFIED. Paid benefit remains individual Driver Pro Load Finder.
- iPhone registration / Apple team / signing: UNVERIFIED.
- Preview build / installation / native smoke: NOT_STARTED.
- Physical BOL/POD signature acceptance, retry/versioning/authorization: NOT_RUN; existing automated coverage does not substitute for device acceptance.
- RevenueCat sandbox cancellation/purchase/unlock/Finder/restore/account isolation/offline/expiry: NOT_RUN.
- Production build: NOT_STARTED. App Store submission is not authorized.
- A1 RevenueCat, A2 native public release, A3 judge environment, A4 submission package: OPEN.
- Ready for App Store / hackathon submission: NO.

## Regression caveat carried forward

The supplied baseline's unqualified 24/24 PASS is superseded by LP-UI-POLISH-01 evidence: **24/24 PASS only in the offline diagnostic run**, `test-results/regression/2026-09-29T19-56-39-766Z/results.json`. The normal live run failed Expo compatibility, recommending `expo ~57.0.26`, `expo-constants ~57.0.20`, `expo-document-picker ~57.0.3`, and `expo-router ~57.0.24`. Installed versions were 57.0.25, 57.0.19, 57.0.2 and 57.0.23. Offline validation explicitly warns it is unreliable; the live failure remains unresolved.

Focused verification this checkpoint: remote `project:info` PASS; resolved public Expo config PASS; native identity assertions PASS. No regression suite or migration was repeated for project binding. Signature migration activation and existing development/test data remain unchanged. Run the final live gate after environment/native configuration stabilizes, without suppressing its compatibility failure.

## Required action and exact resume

Fredrick identifies an existing approved hosting provider and project/server URL, or replies **No hosting account yet.** Do not request or paste secrets in chat. No provider account, charge, infrastructure or deployment was created during project linking.

The existing deployment artifact is `infrastructure/docker/api.Dockerfile`, with repository-root build context. Preserve this runtime contract on the selected host:

```text
Node 24 / one always-available API replica / HTTPS
Existing development/test Supabase PostgreSQL (no migration)
Private durable volume: /data/loadpacket/documents
DOCUMENT_STORAGE_ROOT=/data/loadpacket/documents
Health: /api/v1/health
Database health: /api/v1/health/database
```

API environment names are established by `.env.example` and the deployment runbook: `NODE_ENV`, `PORT`, `DATABASE_URL`, `DOCUMENT_STORAGE_ROOT`, `DOCUMENT_DOWNLOAD_SECRET`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `WEB_APP_URL`, `CORS_ORIGINS`. Values must go into the selected host's protected environment; never into EAS public client variables. Exact web origin/CORS and deployment upload method remain unresolved until hosting is selected. No GitHub connection or source push is authorized implicitly.

Next action after the hosting reply: inspect/access that specific host, prepare the existing Docker service and private volume with development/test environment values, and stop at any provider-required account/login/payment/deployment confirmation. Do not skip ahead to native build or provider purchase acceptance.

Changed this run: approved EAS project creation, `apps/mobile/app.json` project binding, and this report. Unchanged: application behavior, dependency manifests, database/schema/migrations, Apple/RevenueCat configuration, deployments, signing and source control. No build or submission started.

Remaining P1: Finance Owner manual acceptance, deployed broker-recipient test, real invitation delivery, README/judge instructions, and truthful extraction claims. Do not let these replace the current authentication checkpoint.
