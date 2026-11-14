# LoadPacket Day 7A — Company Profile and Driver Management

Date: September 19, 2026.

## Day 7A Result

**PARTIAL: feature implementation, forward migration, automated checks and live-database integrity checks are complete. Real-account Owner/Marcus browser acceptance remains a manual verification step.** No live passwords were requested or used. Marcus's existing database account mapping and all original records were verified unchanged.

## Architecture

Authenticated Owner/Dispatcher → existing AuthGuard and role policy → `currentUser.organizationId` → CompanyService / DriverManagementService → tenant-scoped Prisma.

The company module owns organization profile administration. DriverManagementService handles roster/profile/status administration separately from the existing driver load workflow. LoadsService and driver administration share a tenant-scoped driver row lock inside their transactions. Existing Supabase verification, guards, `/me`, User mappings, bearer transport and financial calculations were not redesigned.

Read-model JSON contracts live in `packages/api-contracts/company-drivers.d.ts`, imported as types by Nest and Next. The pre-existing shared package directories had no active contracts; no new runtime package/dependency was needed.

## Schema Changes

Organization keeps its existing `name` as the legal company name. Added nullable DBA, MC, USDOT, phone, email, address line 1/2, city, state and postal code; country defaults to US, timezone to America/Chicago, default payment terms to 30 days. A database check constrains payment terms to 0–365.

Driver keeps existing names, contact details, ACTIVE/INACTIVE status and User link. Added nullable CDL number/state, calendar-date CDL expiration, calendar-date hire date and notes. No CDL uniqueness rule was imposed without an established business requirement.

Applied `20260919120000_add_company_driver_management` using `prisma migrate deploy`. This avoids a development shadow-database/reset workflow on the existing hosted database. Prisma 7 and `@prisma/adapter-pg` are unchanged.

The partial expression index `drivers_active_email_per_organization` uniquely constrains `(organization_id, lower(btrim(email)))` for nonblank emails on ACTIVE drivers. Email is normalized on input; application checks give actionable messages, and the database index closes concurrency races. Inactive records may share an email; reactivation checks uniqueness again. Another organization can use the same email. The expression index is documented in migration SQL because it is not represented by the Prisma model declaration.

Before migration, the database had no conflicting active email groups. Preservation fingerprints before/after migration and after the isolated database tests matched for all original records: 1 organization, 1 driver, 2 users, 5 loads, 5 assignments, 24 documents, 24 versions, 28 events, 2 agreements, 2 agreement versions and 4 money opportunities. Marcus remains linked to his active application account. No existing records were deleted, recreated or rewritten by the migration.

## API Routes

New/enhanced routes:

- `GET /api/v1/company`
- `PATCH /api/v1/company`
- `GET /api/v1/drivers` — now includes active and inactive drivers, account connection and current-load summary.
- `POST /api/v1/drivers`
- `GET /api/v1/drivers/:driverId`
- `PATCH /api/v1/drivers/:driverId`
- `POST /api/v1/drivers/:driverId/activate`
- `POST /api/v1/drivers/:driverId/deactivate`

Hardened existing `POST /api/v1/loads/:loadId/assign-driver`. All existing staff `/drivers/:driverId/loads/...` and driver `/me/loads/...` routes remain available under their existing role policies. No public route was added.

## Authorization Matrix

- **OWNER:** read/edit own company; list/create/read/edit/activate/deactivate own drivers.
- **DISPATCHER:** read company API; full operational driver management. Company settings web page and company edits remain Owner-only.
- **BACK_OFFICE:** read company API only; no roster administration.
- **DRIVER:** no company administration or roster access. Existing own-load workflow remains unchanged.

## Company Profile

Owner can view/save business identity, contact information, address and operating preferences. PATCH updates only submitted properties. Blank optional fields clear to null; required fields cannot be null/blank. The web form submits only changed fields. New defaults are stored profile metadata; existing billing/payment calculations and terms behavior were intentionally not changed by this slice.

## Driver Management

The roster includes inactive drivers, local name/email search, Active/Inactive/All filters, current-load summaries and derived account connection. Adding a driver creates an ACTIVE operational record in the authenticated company, without creating a User or invitation.

Detail shows contact/license/hire/notes, account connection, current assignment, the ten most recent non-cancelled loads and total non-cancelled assignment count. It supports inline profile editing and explicit activate/deactivate commands. Current assignment is queried separately from the ten recent loads, so it cannot disappear behind newer completed history. No DocumentVersions are loaded for roster/detail.

Account connection means an existing User link is present; it does not assert that an invitation was sent or that the linked account is currently enabled. Driver status changes preserve the User link and all historical records. The existing auth policy still rejects an inactive Driver account until the Driver is reactivated.

Roster relations are fetched through bounded Prisma relation selections rather than per-driver service calls. Detail uses a fixed number of queries and caps recent history at ten. Multiple active assignments are allowed by the existing model; the latest active assignment is displayed, while any active assignment blocks deactivation.

## Assignment Hardening

Inactive drivers cannot receive new assignments; the API returns 409 with an actionable message. Missing/cross-tenant drivers return 404. Assignment and profile/status operations lock the same driver row in their transaction before reading status. This prevents concurrent assignment and deactivation from both succeeding.

ASSIGNED, ACCEPTED and IN_PROGRESS assignments block deactivation with a 409 naming the load. COMPLETED and CANCELLED assignments do not block. Activation/deactivation to the already-current status causes no extra update or audit log. Existing assignment LoadEvents retain authenticated actor identity.

## Tenant Isolation

Organization comes solely from the authenticated application User. Company routes take no tenant identifier. Driver queries/updates and lock SQL include organization scope. Related assignment queries include organization and driver. Foreign driver get/edit/activate/deactivate requests return 404. Input DTOs reject organizationId, userId, role, status and other unexpected management fields according to the global whitelist policy. Driver/User linking remains outside this feature.

## Validation

- `UpdateCompanyDto`: nonblank legal name/timezone when supplied; bounded strings; valid optional email; country length 2–60; integer payment terms 0–365. Null is rejected for non-nullable company fields.
- `CreateDriverDto`: trimmed nonblank first/last name, valid optional email, bounded phone/license/state/notes, real YYYY-MM-DD calendar dates from year 1900 onward. Invalid leap dates and timestamps in date-only fields return 400.
- `UpdateDriverDto`: same profile validation, with omitted names accepted for partial updates; null/blank names rejected.
- `DriverStatusCommandDto`: empty command body; identity/profile injection is not accepted.
- Empty optional strings normalize to null; email normalizes to lowercase. Duplicate active-email conflicts return 409 with a company-specific explanation. No raw Prisma details reach clients.

## Web UX

Created `/settings/company`, `/drivers`, `/drivers/new`, `/drivers/[driverId]`. Driver editing is inline. Shared management fields, panels and feedback keep forms consistent with existing styling. Added loading/saving/disabled states, browser/server validation feedback, success messages and account connection labels. No fake document data is shown.

Owner navigation now exposes Dashboard, Loads (the existing dashboard load section), Drivers, Company Settings, Back Office and Accounts Receivable. Dispatcher navigation includes Drivers; Driver users see neither management section. Responsive layouts and visible keyboard focus were checked at 390px width. The mobile-browser form was visually inspected from a test screenshot.

## Tests

**20 API unit tests passed**, preserving the Day 7 auth/bootstrap checks.

**124 HTTP API tests passed**, including **59 new Day 7A cases** plus the existing 65. The new cases cover role restrictions, two-tenant company/driver isolation, partial updates, normalization and nullable clearing, invalid/forged input, operational creation without account provisioning, email conflicts across create/update/reactivation, every active assignment state, inactive history, idempotent status commands, inactive assignment rejection, successful assignment with actor audit identity, and bounded recent-history queries. Guards/controllers/services execute; persistence and JWT transport are mocked at the boundary.

**10 Playwright tests passed**, including six new management flows plus four existing auth/session tests: company edit/reload, driver create/edit/deactivate/filter/reactivate, duplicate-email feedback, Marcus account/history and deactivation conflict, Driver denial, Dispatcher access restrictions, mobile width/keyboard navigation and readable request failures. Browser tests use a local Auth/API fixture and do not mutate the real carrier.

The opt-in **live database integration test passed** against the existing PostgreSQL host using an isolated D7A tenant. It exercised real services/Prisma, concurrent assign/deactivate locking, successful active assignment, active-load deactivation denial, the database trimmed/case-insensitive uniqueness constraint, conflicting reactivation and preserved completed history. The test removed only its own newly created tenant records. Post-test fingerprints confirmed all original records remained unchanged.

Compiled API smoke passed: public API/database health, anonymous rejection and bearer CORS. Live real-account password login was not repeated; use the checklist below.

## Build Results

- API Prisma Validate: PASS.
- API Prisma Generate: PASS.
- API Migration: PASS, forward deploy applied.
- API Typecheck: PASS.
- API Lint: PASS.
- API Build: PASS.
- API Unit Tests: PASS, 20.
- API E2E: PASS, 124.
- Web Typecheck: PASS.
- Web Lint: PASS.
- Web Build: PASS, includes all four new routes.
- Playwright: PASS, 10.

The first browser run exposed ambiguous test selectors (Next's route-announcer alert and the select label); selectors were corrected and the suite rerun. No tests were removed or disabled. Lint/type errors found while adding tests were corrected. No new dependency or auth configuration was required.

Commands used `pnpm --filter api ...` / `pnpm --filter web ...` with this workspace's approved `--store-dir C:/Users/User/AppData/Local/pnpm/store --config.verify-deps-before-run=false` options. Ran Prisma validate/generate/migrate deploy; API typecheck/lint/build/test --runInBand/test:e2e --runInBand; web typecheck/lint/build/exec playwright test. Additional checks: `node scripts/day7a-database-check.cjs --before`, then without `--before` after migration/tests; `node scripts/day7-api-smoke.cjs`; and the opt-in database test below.

```powershell
$env:RUN_DAY7A_DATABASE_TESTS='1'
pnpm --filter api exec tsx test/company-drivers.database.ts
```

## Files Changed

Complete Day 7A inventory: [day7a-files.md](day7a-files.md). Pre-existing unrelated dirty/deleted files remain untouched. Real environment values were not edited; their commented-out ignore rules were restored to prevent accidental inclusion in Git. Generated Prisma client output was regenerated and remains ignored.

## Manual Verification

Use the existing real accounts and a clearly marked test driver/load. Restart API/web processes after pulling the generated client and migration; no new environment variables are required.

1. Sign in as the real Owner. Open Company Settings. Confirm the current legal name is preserved. Change a noncritical test field, save, refresh and verify persistence; restore the original value afterward.
2. Open Drivers. Confirm Marcus Reed is visible. Open him and verify Account Connected, current assignment and recent history. Do not deactivate or reassign Marcus for this test.
3. Add **D7A Test Driver** with a unique test email. Verify ACTIVE, Account Not connected, and no automatic invitation. Edit phone/license metadata and verify it persists after refresh.
4. With no assignments, deactivate the test driver. Verify the Inactive filter shows the profile and detail is still accessible. Reactivate; verify Active filter and search by email/name.
5. Create a clearly marked fresh test load and assign an ACTIVE D7A test driver. Verify the assignment and LoadEvent.
6. Try deactivating that driver while the assignment is active. Expect 409 and a message naming the load. The driver must remain ACTIVE.
7. Create a second unassigned D7A test driver and deactivate it. Confirm the load assignment picker excludes it. Using an authenticated API client, explicitly submit its UUID to `POST /api/v1/loads/:loadId/assign-driver`; expect 409. Frontend filtering is not the enforcement boundary.
8. Verify completed history remains visible when an eligible test driver is deactivated. Preserve test history; no hard-delete operation exists in the product.
9. Sign out. Sign in as Marcus using his existing Supabase account. Verify own-load access still works, while `/drivers` and `/settings/company` are inaccessible and absent from navigation. Sign out again.
10. Optionally use a separate tenant Owner in a test environment to request/edit/deactivate the other company's driver UUID; expect 404. The automated HTTP suite already exercises these cases without requiring another live account.

## Deferred to Prompt 7B+

Driver invitations, Supabase Admin API, mobile, RevenueCat, document vault, document review, payment hardening, Broker Connect and detention were not implemented. No service-role key, invite token, banking/payroll/tax fields, upload workflow or generic audit framework was added.

## Risks / Follow-ups

- Live real-account browser acceptance is the remaining verification step; the account links were preserved and existing auth behavior passed fixture/HTTP tests.
- Administrative audit uses timestamps and structured actor/organization/entity/action logs, with no profile contents or CDL data logged. Durable searchable administrative audit history remains future work.
- Default payment terms are saved company metadata in this slice; applying them to future billing defaults belongs with the financial workflow work. No existing or new load terms are silently changed by editing the profile.
- The custom partial expression index must be retained in future migrations. Old environments with duplicate active-driver emails will fail migration safely and require explicit data cleanup; no automatic merging/deletion is performed.
- Standard profile edits use last-write-wins behavior. No optimistic concurrency/version UI was requested.
- The test/build runtime emitted a Supabase SDK warning about future support for Node 20 and below. Checks passed; update the runtime to a supported newer Node release as part of environment maintenance.
