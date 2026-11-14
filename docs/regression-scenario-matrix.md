# LoadPacket regression scenario matrix

Classification describes coverage, not an assertion of a live PASS. Commands emit current counts in `test-results/regression/<timestamp>/results.json` and `results.md`; generated outputs are ignored.

## Automated

- AUTH — `auth.e2e-spec.ts`, `driver-invitations.e2e-spec.ts`, mobile tests: anonymous/invalid/expired identity, inactive user, pending onboarding, wrong role, own-load mapping and session restore/refresh/account-switch races.
- TENANCY — API auth/company/vault/review/payments/product-sprint tests: cross-organization loads, Drivers, documents, payments, Broker link creation/listing/revocation and cross-access document grants.
- DRIVERS — company/driver invitation tests: duplicate email, inactive assignment, active-assignment deactivation, connected-email edits, compensation and onboarding identity boundaries.
- WORKFLOW — auth/production-workflow tests: accept/repeated accept, start-before-accept/start/repeated start, missing-paperwork completion, successful/repeated completion. Golden path adds ordered stop progression, scan and logged-out Broker read after paid load.
- STOPS — stop-events HTTP tests: arrival/repeated arrival, depart-before-arrive/depart/repeated depart, arbitrary multi-stop order, present/null location, invalid coordinates and unknown actor fields. Opt-in database test verifies real row-lock concurrency.
- DOCUMENTS — vault/review/auth tests: BOL/POD, MIME/signature/size validation, RECEIVED/ACCEPTED/REJECTED/WAIVED, stale review, immutable corrected version, private grant authorization. Mobile tests validate supported MIME/size and multipart boundaries; camera hardware remains MANUAL.
- DETENTION — detention calculator + product-sprint HTTP: below/equal/above free time, minute floor, minimum, rounding increment, cap, unknown terms/rate without fabricated money, pickup/delivery, repeat scan, immutable terms, amount audit/approval and Driver/Dispatcher denial. PostgreSQL concurrent scans are opt-in; same isolated tenant tests concurrent link regeneration.
- BILLING — payments/production-workflow: readiness blocker, billing success, repeated/concurrent billing via isolated database tests. Detention remains a reviewed follow-up because this invoice engine has no extra-charge billing path; no automatic historical invoice edits.
- PAYMENTS — payments HTTP/database: partial/final, zero/negative/overpayment, duplicate key, same key with different amount, simultaneous payments and already-paid state.
- BROKER — product-sprint HTTP: valid/expired/revoked/random, hash-only persistence, regeneration invalidates prior links, permission-limited response, document denial, grants revoked immediately, lastAccessedAt, no internal IDs/financial data. Browser tests cover logged-out valid/unavailable pages, no internal navigation, header transport and fragment removal.
- REVENUECAT — mobile adapter tests: purchase success/cancellation, entitlement, restore, identity switch and stale callback protection. Provider-native success/failure/configuration belongs to LIVE/MANUAL below.
- SECURITY AUDIT — scripts inspect source/config/client build output for configured server-secret values/private-key patterns and disallowed client server-env references, without printing matched values. Hash-only token persistence and omission of identity/financial fields are behavioral API tests. Hosting/proxy/analytics log settings require MANUAL review.

## Live / manual (MANUAL_REQUIRED until observed)

`pnpm regression:live` creates a MANUAL_REQUIRED checklist result and exits nonzero. It performs no provider operations. The operator records tester, environment, app/build versions, date, each observed outcome and evidence paths in a separate acceptance record. Never convert an unperformed check into PASS.

1. LIVE — Supabase invitation, delivery to real test inbox, web password setup, active Driver mapping, real login, cold restart session restoration and logout. Sending invitations is a separately authorized operator action.
2. MANUAL — signed native build: My Loads → Accept → Start → pickup arrival/departure → photograph BOL → delivery arrival → photograph POD → departure → complete → logout. Verify API and office state. Repeat with camera denied, location denied/services off/timeout, interrupted network, upload retry and repeated taps. No background collection; cancelled confirmation records nothing.
3. LIVE — RevenueCat sandbox on signed build: current Offering and localized price, cancellation, sandbox success/active entitlement, restart, restore and account switch. Test missing key/offering, provider/store failure and no matching entitlement. Confirm load execution without Pro. No production real-money purchases.
4. LIVE — isolated detention load: controlled timestamps beyond reviewed free time, scan once and again, approve/dismiss with office role, immutable audit and separate billing follow-up. Do not wait hours or edit customer/demo history. Use the opt-in isolated PostgreSQL fixture for timestamp manipulation.
5. LIVE — Owner creates Broker link, chooses minimal permissions/document types; open in logged-out/incognito/different browser, verify only selected load data, download authorized file, revoke, confirm subsequent refresh/download fail; regenerate and verify old link fails. Observe expiry and permission-denied download. Remove local copies of test-only shared links after acceptance.
6. MANUAL — production-like storage: one API replica with a durable private mount; upload/retrieve with authorization, restart process/container and redeploy with the same volume, verify matching checksums; expired/revoked grants fail. Verify the storage path is not served publicly. Follow `production/first-deployment-checklist.md`; multi-replica storage is deferred beyond the hackathon.
7. MANUAL — store privacy forms, approved Terms/Privacy/Support URLs, icons/screenshots, signed manifest/Info.plist permissions, consistent supported Node runtime, private log redaction and edge limits.

## Deferred

Broker agreement acceptance/signature (P1); automatic detention claim submission; automatic scan coupled to Driver departure; adding approved extras to an issued invoice; background tracking/geofencing; accounting/EDI; advanced offline queues; Owner mobile. Existing manual/Owner-page scan and audited money review are available.

## Safe execution

`pnpm regression:quick`: typechecks, targeted detention/product HTTP/mobile tests and secret audit.

`pnpm regression:full`: Prisma validate/generate/status; all API/web/mobile checks, golden path within API HTTP suite, Playwright, Expo config and native bundles, source/build secret audit. Isolated database concurrency runs only when `RUN_MOBILE_DATABASE_TESTS=1`; without it the report explicitly records NOT_RUN/manual required. Use only an appropriately configured development/test database. Fixtures use random isolated tenant IDs and remove only those created rows; they never reset, truncate, seed, invite or delete operational users/data.
