# LoadPacket Days 11–13 release report

Date: September 23, 2026. Repository: `C:/Users/User/Documents/loadpacket`.

## Overall result

Status: **IMPLEMENTATION_COMPLETE_EXTERNAL_CONFIGURATION_REQUIRED**. The full automated gate passed all 22 checks. Production release requires external configuration and native/device acceptance. No deployment, signing, submission, invitation email or purchase was performed.

Day 11: COMPLETE for the implemented automated scope. Day 12: COMPLETE for the implemented automated scope. Day 13: IMPLEMENTATION_COMPLETE_EXTERNAL_CONFIGURATION_REQUIRED. Regression harness and automated gate: COMPLETE; live/device acceptance: IMPLEMENTATION_COMPLETE_DEVICE_ACCEPTANCE_REQUIRED.

The existing dirty workspace and Days 7–10 architecture were preserved. No reset, reseed, historical migration change, dependency upgrade, commit or push occurred.

## Day 11 — Detention and financial review

The existing Money Found scanner now detects pickup and delivery detention from persisted stop arrival/departure timestamps. It takes a tenant-scoped load row lock and uses a unique `(organizationId, loadId, detectionKey)` constraint. Repeated/concurrent scans cannot create a second opportunity for the same stop; subsequent scans retain existing decisions and evidence.

The calculator uses Prisma Decimal throughout monetary arithmetic. It floors elapsed time to whole minutes, subtracts reviewed free minutes, applies an optional minimum, rounds billable minutes upward to the contractual increment, multiplies by hourly rate / 60, applies the optional cap, and rounds once to cents using half-up. Missing/reversed timestamps and waits at/below free time produce no opportunity. Amounts outside the persistence range remain manual review candidates.

Unknown terms use a clearly labeled 120-minute review trigger, not an assumed contractual entitlement: free time, billable minutes and amount remain null. A known free period without a rate yields a billable duration and no invented amount. Estimates never authorize financial decisions.

Owner/Back Office can record contract terms with a required source/review basis. This appends hashed, immutable AgreementVersion JSON to a draft review amendment; it is not broker acceptance. Detention evidence records the timestamps, calculation, terms and agreement version used. Updated terms do not rewrite an earlier opportunity; the authorized reviewer adjusts its amount through the existing audited review endpoint. Approvals and dismissals retain existing immutable decision behavior. Drivers and Dispatchers cannot change money or terms.

The load page uses the existing Money Found cards/review controls plus a terms form. Totals now sum integer cents with BigInt rather than floating-point arithmetic. Scan remains available through the existing Owner workflow; departure does not automatically trigger a scan. The existing invoice service has no approved-extra billing integration: detention remains a reviewed billing follow-up, explicitly flagged when an invoice exists. No issued invoice, receivable or settlement is rewritten.

## Day 12 — Broker Connect

The existing ExternalTransactionAccess model now supports an Owner-only sharing workflow. Generation creates 32 random bytes, stores only a SHA-256 hash, and returns the raw token once. Supported expirations are 1, 7 or 30 days. Generate/regenerate and revoke serialize on the tenant load lock; regeneration invalidates prior broker links. Owner listings contain metadata, expiration/revocation and last access, never the hash or original token.

The public web URL is `/broker/t#<token>`. The fragment avoids placing the token in HTTP server URL logs; the page removes it on opening, retains it only in memory, and sends `X-Broker-Token` to the API. Refreshing the browser requires reopening the original link; the page's Refresh button preserves the in-memory token. The route bypasses internal authentication/navigation and uses no-store/no-referrer/noindex protections. Operators must also redact credential headers in hosting/proxy/analytics configuration.

Permissions explicitly allow load summary, route, agreement summary, document status, delivery timeline and selected shared documents. Everything else is denied. The response is a dedicated projection with no organization/load/Driver IDs, contact data, internal financial decisions, payment details, raw agreement terms or event metadata. Agreement sharing is read-only title/status; acceptance/signatures are deferred.

Document selection is limited to rate confirmation, BOL, POD and carrier invoice. Load/tenant links and the selected document types determine eligibility; Driver/company vault evidence is excluded. Downloads use opaque HMAC grants lasting at most 60 seconds, bound to the access record and document version, plus the original currently valid token. Revocation/expiration is checked again after storage I/O. No permanent storage URL, path, internal version ID or original filename is projected. Production requires a server-only download secret of at least 32 characters.

## Day 13 — Release configuration

App identity stays `com.loadpacket.driver` on both platforms; display name LoadPacket Driver, scheme `loadpacket`, version `1.0.0`. Initial iOS buildNumber is `1`, Android versionCode is `1`; EAS uses remote build counters with production auto-increment. Development/preview remain internal profiles. No mobile workflow redesign was needed.

Camera/photo, SecureStore and foreground-only location configuration remain intact. Background location and Android audio recording are blocked. Generated bundles/configuration are checked by the gate; final signed manifests, native installation and permission behavior still need device acceptance.

See [release readiness](release-readiness.md) for data inventory, privacy/store assets, RevenueCat, Supabase, runtime and storage checklists. Node engines require >=22.13.0; use a consistent Node 24 runtime across shell, package manager, CI and deployment. Earlier nested tool warnings about Node 20 are not production acceptance evidence.

**PRODUCTION_STORAGE_CONFIGURATION_REQUIRED:** the existing private filesystem adapter needs a durable private volume at `<API working directory>/storage`, consistent working directories and backup/replica strategy. Ephemeral deployment disks are insufficient. Verify authorized retrieval after restart or supply an object-storage adapter before deploying without persistent disk.

## Regression and acceptance

Commands:

```powershell
pnpm regression:quick
pnpm regression:full
# Include isolated real PostgreSQL concurrency checks only on a development/test DB:
$env:RUN_MOBILE_DATABASE_TESTS='1'
pnpm regression:full
# Report-only checklist; intentionally nonzero while acceptance is outstanding:
pnpm regression:live
```

The existing `release:*` commands remain available. Reports and individual command logs are under `test-results/regression/<timestamp>/results.json` and `results.md`. Test counts are parsed from each execution, not fixed in the harness. Failure stops the gate with a nonzero exit. Live mode records MANUAL_REQUIRED and performs no provider actions. Isolated DB fixtures create random tenant IDs and clean up only their own data; they never reset or seed operational data.

- Quick: PASS, `2026-09-23T06-40-34-170Z` — 7 detention cases, 6 product HTTP cases, 16 mobile cases, 6 secret audit cases, targeted typechecks and secret audit.
- Full: PASS, `2026-09-23T06-40-55-340Z` — all 22 checks in 2m54s: 75 API unit tests, 218 API HTTP tests, 26 Playwright tests, 16 mobile tests and 6 secret audit self-tests. API/web/mobile typecheck and lint pass; API/web builds, Android/iOS bundles, Expo compatibility/configuration, Prisma validate/generate/status, isolated PostgreSQL concurrency and secret audit pass. Counts are observations from this run, not harness constants.
- Live: MANUAL_REQUIRED, `2026-09-23T06-35-04-165Z` — no external operations.

The [scenario matrix](regression-scenario-matrix.md) classifies automated, live, manual and deferred checks. The golden HTTP workflow now includes stop events and detention scan, then continues paperwork review → invoice/billing → partial/final payment → public Broker access. New security cases cover null-rate review, amount/terms authorization, hash-only token persistence, response redaction, expiry/revocation/regeneration, cross-load and expired grants, and vault evidence exclusion. Real PostgreSQL tests cover stop row locks, concurrent scans and concurrent Broker regeneration.

Physical-device login/camera/location/upload/error recovery, Supabase invitation delivery/onboarding, RevenueCat sandbox purchase/restore, deployed cross-browser sharing, persistent production storage and store submission remain unperformed. Automated adapters and JavaScript/Hermes export do not count as live/native acceptance.

## Migration and routes

Applied forward migration `20260923120000_add_detention_evidence`: nullable detection_key/evidence fields and a tenant/load/detection unique index on load_charge_opportunities. All 14 migrations are applied. No external-access migration was needed. Pre-existing data fingerprints matched after migration and again after the full gate's isolated tests. A final Prisma datasource-to-schema diff found no difference.

New API routes (under `/api/v1`):

- `POST /money-opportunities/loads/:loadId/detention-terms` — Owner/Back Office, validated immutable review.
- `GET /loads/:loadId/broker-access` and `POST /loads/:loadId/broker-access` — Owner listing/generation.
- `POST /loads/:loadId/broker-access/:accessId/revoke` — Owner revocation.
- `GET /external/transactions` — public, valid broker token header required.
- `POST /external/transactions/download` — public, valid token header and document grant required.

Existing scan, amount, approve and dismiss routes are reused. Web `/loads/[loadId]` adds authorized terms/sharing controls; `/broker/t` is the new logged-out read-only page.

## Security audit

The product audit scans source/config/build files, compares configured server secret values in memory, checks private credential/key patterns and raw JWTs, and rejects server-variable access in owned client sources. Legacy public Supabase anon keys and intended public SDK keys are allowed. Supabase library documentation mentioning environment variable names and a short dummy test key are not credentials; audit self-tests distinguish these from actual value leakage. Matches report filenames only, never the value. API behavior separately verifies raw Broker tokens are not persisted or exposed in listings/projections. The mobile audit checks secrets and foreground-only location policy.

This automated audit does not prove hosted log redaction, absence of every possible encoded secret or third-party privacy compliance. Production proxy/header logging and native/store disclosures require operator review.

## Changed files in this sprint

- API: Prisma schema/new migration; `src/money-opportunities/{detention.ts,detention.spec.ts,detention.service.ts,detention-terms.dto.ts,money-opportunities.controller.ts,money-opportunities.service.ts,money-opportunities.module.ts}`; new `src/external/*`; `src/app.module.ts`, `src/main.ts`.
- Tests: product-sprint HTTP suite, production-workflow golden path, stop-events database concurrency, payment database service construction, shared database fixture, Supabase adapter dummy key.
- Web: `src/components/{detention-terms,broker-connect}.tsx`, `src/app/broker/t/page.tsx`, load detail page, auth provider, proxy and broker Playwright tests.
- Release: mobile app/EAS config, root package scripts/engines, release gate, product secret audit/self-tests; this report, progress ledger, release readiness and scenario matrix.

These are sprint changes, not a claim that every dirty/untracked file in the workspace was created here.

## Remaining configuration, deferred work and risks

External requirements: HTTPS web/API origins and exact CORS, Supabase callbacks/SMTP, RevenueCat/store products/keys/offerings, EAS/store ownership/signing, approved Privacy/Terms/Support URLs, final artwork/screenshots, durable private storage, server download secret, edge throttling and native/provider acceptance evidence.

Deferred: Broker agreement acceptance/signing (P1), automatic departure-triggered scans and detention claim submission, approved-extra invoice integration, background tracking, accounting/EDI, advanced settlements/offline queues and Owner mobile. A bearer link authorizes anyone holding it until expiry/revocation; revoke promptly if misdirected. Already downloaded copies cannot be recalled. Contractor-reviewed terms remain a human decision, and a detention estimate does not establish collectability.
