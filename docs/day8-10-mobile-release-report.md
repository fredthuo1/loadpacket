# LoadPacket Days 8–10 — Mobile Release Candidate

Date: September 20, 2026 (America/Chicago). Repository: `C:/Users/User/Documents/loadpacket`.

## Result

**Implementation complete; external configuration and native device acceptance required.** Android and iOS JavaScript/Hermes bundles build successfully. This is not a claim that a signed native app, live login, or real store purchase has been tested on a device. No Android runtime/device was available in this workspace, and no store build or purchase was initiated.

Day 7 implementation and existing dirty workspace changes were preserved. No reset, seed, historical migration edit, commit, push, or deployment occurred. One additive migration was applied, with matching before/after fingerprints for every pre-existing business row and column.

## Day 8: Driver mobile

Expo SDK 57, React Native 0.86.3, React 19.2.3, TypeScript 6, Expo Router, native Supabase session storage in SecureStore. The dependency compatibility check passes. The initial TypeScript 5.9 choice was corrected to Expo's expected 6.0 version after the compatibility check; unrelated workspace dependencies were not upgraded.

- Login supports password entry, keyboard handling, loading, invalid credentials and connection errors. `/me` resolves application identity; Owner/Dispatcher/Back Office accounts cannot enter Driver screens. Invitation/pending mapping errors direct the user to carrier email onboarding.
- Sessions restore securely, refresh while foregrounded, and unsubscribe on teardown. A single API client handles Bearer authorization, JSON/multipart, timeouts, bounded 401 refresh/retry and local sign-out. Concurrent refreshes are shared; account changes reject stale requests/responses.
- My Loads groups actual assignment statuses, supports focus refresh, pull refresh, empty/error/retry states, and shows only the Driver API projection.
- Detail presents stops, equipment, server recommendations, paperwork and Delivery Guard. Accept/start/complete use the existing server endpoints, prevent double taps, and refresh detail/Autopilot. Completion requires confirmation. Mobile guides drivers through the server's next stop action before exposing enabled completion; existing backend completion rules remain compatible with Day 7.
- Camera, photo library and PDF/file capture support BOL, POD, lumper receipts and scale tickets. MIME/size validation matches the existing PDF/JPEG/PNG, 10 MiB limit. Unknown/empty sizes and unsupported images such as HEIC are rejected with a useful message. Received paperwork is explicitly awaiting review. Rejected requirements accept a new immutable version using the existing API.
- Failed uploads retain a local file descriptor for an explicit retry while the screen remains open. There is no offline queue, automatic financial decision, broker/rate exposure, or fabricated upload success.

## Day 9: RevenueCat

RevenueCat React Native SDK 10.10.0 is behind a native adapter and serialized service/context. It configures with the platform's public SDK key and stable LoadPacket `User.id`, handles login/logout, clears account state on changes, and revalidates late SDK callbacks. Account → Pro displays current Offering packages with store-provided localized prices. Purchase, cancellation, restore, refresh and the configured active entitlement are implemented. Missing configuration and empty Offerings have visible states. Expo Go is explicitly excluded from the real purchase path.

No Driver operational action reads `isPro`. Organization billing enforcement remains outside this sprint. Automated subscription tests use a mock adapter; they never contact stores or RevenueCat.

## Day 10: Stops and location

New authenticated Driver routes under `/api/v1`:

- `POST /me/loads/:loadId/stops/:stopId/arrive`
- `POST /me/loads/:loadId/stops/:stopId/depart`

Body: `{ latitude?, longitude?, accuracyMeters?, capturedAt? }`. `{}` or all-null values record a manual event. Coordinates must be supplied together, finite and in range. Accuracy must be nonnegative; capture time must be ISO 8601. Accuracy/time without coordinates is rejected. Unknown fields, including organization/driver/role/actor identity, are rejected by the global validation pipe.

The service locks the tenant's load row, rechecks active Driver/User mapping and assignment, and reads ordered stops inside the transaction. New events require IN_TRANSIT/IN_PROGRESS. Only the first unfinished stop can advance; departure requires arrival. Authorized duplicate calls return original timestamps without overwriting first location evidence or adding events, including retries after later progression. Cancelled/unassigned/foreign access cannot use the duplicate path.

Migration `20260920120000_add_stop_event_timestamps` adds nullable `arrived_at` and `departed_at` to `load_stops`, with a departure-after-arrival database check. Location and location absence live in existing LoadEvent metadata. Server event time is authoritative; device capture time is metadata. Stop events do not change load/financial status. Driver detail now returns safe ordered stops and allowed actions; Driver Autopilot adds `stopAction` and stop timeline entries while omitting coordinates and financial audit metadata.

Location is requested only after an explicit stop action and explanation. A foreground lookup has a 12-second timeout. Denial/failure offers a separate manual confirmation; there is no background tracking, geofencing or continuous watcher. Maps opens an encoded address search. Confirming an event does not silently capture it offline.

## Automated validation

- Mobile: typecheck, lint, 16 unit tests, Expo dependency compatibility, source/config secret scan, Android and iOS bundle exports.
- API: Prisma validate/generate, typecheck, lint, build; **68 unit tests** and **212 HTTP tests** pass. The HTTP total includes 24 new stop cases for roles, tenants, assignments, DTOs, sequence, duplicates, manual location and Driver projections.
- Actual PostgreSQL: four concurrent retries per transition against a new isolated tenant produce one new event per transition; order, timestamps and unchanged IN_TRANSIT status pass. Only that temporary tenant's rows were removed after the test.
- Database: 13 migrations applied; preservation fingerprints match original columns/rows before and after migration. No operational rows were changed by the concurrency test.
- Expo public config resolves foreground permissions and blocks Android background location and audio recording.

Broad API regression ran once at the end. An initial harness command-quoting issue failed before tests and was corrected. Mobile-only checks were repeated after final account-switch fixes; API tests were not repeated. Web checks were not rerun because web implementation was untouched by this sprint. Existing Day 7 browser coverage remains in the optional full harness.

## Repeatable release harness

From the repository root, use Node 24 (Expo 57 requires a supported Node 22+ runtime) and the repository's pinned pnpm:

```powershell
# Cheap iteration / mobile release check (includes both native bundles)
node scripts/release-gate.cjs --scope=mobile

# API only
node scripts/release-gate.cjs --scope=api

# This sprint's final gate: mobile + API, without web
node scripts/release-gate.cjs --scope=release

# Entire product when web changes or before a wider release
node scripts/release-gate.cjs --scope=full
```

Aliases: `pnpm release:mobile`, `pnpm release:api`, `pnpm release:check`, `pnpm release:full`. `--skip-export` is available for cheap iteration, but that result is not a bundle release check. The harness fails fast, returns a nonzero exit code on failure, and writes step logs plus `results.json` to `test-results/release-gate/<UTC timestamp>/`. It never migrates, seeds, purchases, sends email or deploys. `full` includes web typecheck/lint/build/Playwright; this sprint executed `release`, not `full`.

Final broad result: `test-results/release-gate/2026-09-21T04-14-10-087Z/results.json`. Subsequent mobile-only result after final mobile changes: `test-results/release-gate/2026-09-21T04-16-18-145Z/results.json` — all six checks pass. These generated artifacts are intentionally ignored by Git; the checked-in scripts regenerate them.

Explicit database checks (separate from the normal gate):

```powershell
pnpm --filter api exec prisma migrate status
$env:RUN_MOBILE_DATABASE_TESTS = '1'
pnpm --filter api exec tsx test/stop-events.database.ts
Remove-Item Env:RUN_MOBILE_DATABASE_TESTS
```

Use a development/test database for this opt-in test. It creates and cleans up a uniquely identified isolated tenant. It does not reset or seed a database and never creates a Supabase Auth user. Migration preservation helper: `node scripts/day7-migration-preservation.cjs --before`, then compare with `node scripts/day7-migration-preservation.cjs` after the authorized forward migration. Do not run a new baseline after a failed comparison, because that would erase the evidence being compared.

## Local configuration and development build

1. Copy `apps/mobile/.env.example` to `apps/mobile/.env`. Set public Supabase URL/publishable key, API base URL including `/api/v1`, public platform RevenueCat SDK keys, and entitlement name (default `pro`). Keep all server/service/database credentials out of mobile. Expo public variables are bundled into the app; rebuild/restart when they change.
2. For a physical device on the developer network, set `EXPO_PUBLIC_API_URL=http://<DEVELOPER-LAN-IP>:3001/api/v1`. `localhost` would point to the phone. Nest already listens on the default host interface; no production CORS policy was broadened. Permit development LAN traffic in the local firewall as needed. Use HTTPS in production; use a secure development tunnel if platform transport policy blocks local HTTP.
3. Run the API with its existing local configuration: `pnpm --filter api start:dev`.
4. Verify ownership of the initial `com.loadpacket.driver` iOS/Android identifiers, link an Expo/EAS project, configure credentials and public build variables, and create a development build. `apps/mobile/eas.json` has development, preview and production profiles. With Android SDK installed, use `pnpm --filter mobile android`; for iOS native builds use a compatible Mac/Xcode or EAS. Start Metro with `pnpm --filter mobile start`.
5. Expo Go can help with basic preview but is not the acceptance environment for purchases. Use a signed development build or store test build containing RevenueCat's native module.

Compatibility references: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [RevenueCat with Expo](https://www.revenuecat.com/docs/getting-started/installation/expo), [Supabase native authentication](https://supabase.com/docs/guides/auth/quickstarts/react-native).

## External configuration still required

- Confirm Supabase environment, an accepted carrier Driver invitation/password, active Driver mapping and an assigned test load. The mobile release uses the existing web invitation/password onboarding flow.
- Set the device-reachable API URL, deploy the API change and forward migration in each target environment (already applied only to this workspace's configured database).
- Configure the RevenueCat project and platform apps, Apple/Google store products, active entitlement, current Offering/packages, public SDK keys, store agreements, sandbox testers and a signed build. Nothing in source invents product IDs or prices.
- Confirm app identifiers/EAS project/signing and production privacy/store listing information. No live purchase or store submission was attempted.

## Native acceptance checklist — pending

1. Cold-launch the development build, sign in as an invited Driver, kill/relaunch and verify restored session. Sign out, restart, and verify credentials do not restore. Test wrong password, offline login, expired access token, an Owner account and an incomplete invitation.
2. Open My Loads, pull to refresh, check assignment groups and permitted detail fields. Accept, start, and verify list/detail/server state. Repeated taps must not produce duplicate transitions.
3. Record pickup arrival/departure and delivery arrival/departure in order. Confirm timestamps and API events; try a later stop early. Exercise granted, denied, disabled-services and timed-out location; manual confirmation must work. Cancel confirmation and verify no event is recorded. Retry after disconnect and verify no duplicate evidence.
4. Capture a readable BOL with camera, POD from gallery/PDF and applicable receipts. Deny permissions, choose an invalid/oversized file, lose network mid-upload and retry. Reject one document in the office and upload its corrected version; confirm earlier evidence persists. RECEIVED must not be presented as ACCEPTED.
5. Check Delivery Guard blockers, capture all required paperwork, finish stop events, confirm delivery, then verify Completed list and office review. Verify failed API calls never show success.
6. In Apple Sandbox/TestFlight or a Google internal test track with a licensed tester, open Account → Pro. Verify dashboard-configured prices; cancel a purchase; perform a sandbox purchase; verify `pro`, app restart, sign-out/account switch, then restore with the correct store account. Test missing Offering/key and unavailable store. Use sandbox transactions only. Driver operations must work before and after purchase and without Pro.

## Files

New mobile files: `apps/mobile/package.json`, `app.json`, `eas.json`, `tsconfig.json`, `eslint.config.js`, `expo-env.d.ts`, `.gitignore`, `.env.example`; Router files `app/_layout.tsx`, `app/index.tsx`, `app/login.tsx`, `app/(driver)/_layout.tsx`, `index.tsx`, `account.tsx`, `pro.tsx`, `loads/[loadId].tsx`; `src/api/client.ts`; `src/auth/{access,session,supabase}.ts`, `AuthProvider.tsx`; `src/components/ui.tsx`; `src/lib/{loads,files,capture,location,native-location}.ts`; `src/subscriptions/{native,service}.ts`, `SubscriptionProvider.tsx`; `test/mobile.test.ts`.

Backend: `apps/api/src/drivers/{stop-event.dto,stop-events.service,stop-policy}.ts`; updates to `drivers.service.ts`, `drivers.module.ts`, `me-driver.controller.ts`; `apps/api/prisma/schema.prisma`; new migration SQL; `apps/api/test/stop-events.e2e-spec.ts`, `stop-events.database.ts`. Prisma client regenerated (ignored output).

Shared/operations: `packages/api-contracts/driver.d.ts`, root `package.json`, `pnpm-lock.yaml`, `scripts/mobile-audit.cjs`, `scripts/release-gate.cjs`, this report and `docs/day8-10-mobile-progress.md`. No web source changes were made for this sprint.
