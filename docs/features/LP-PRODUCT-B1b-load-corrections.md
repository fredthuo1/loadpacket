# LP-PRODUCT-B1b — Safe load corrections, unassignment and cancellation

Completed: October 22, 2026. **RESULT: PASS for the authorized local implementation and isolated-test gate.** No production rollout or physical-device acceptance is claimed.

## Schema and migration

Added only `LoadStatus.CANCELLED` and `LoadEventType.LOAD_CORRECTED`, `DRIVER_UNASSIGNED`, `LOAD_CANCELLED`. All original enum values remain. No tables, columns, constraints, financial schema, dependency versions or lockfiles changed in this task.

Migration: `apps/api/prisma/migrations/20261021120000_load_management_events/migration.sql`. Its four `ALTER TYPE ... ADD VALUE` statements were inspected before application. The guarded launcher verified the exact server identity and all 17 existing migration checksums before allowing only this pending migration. Prisma client 7.10.0 was regenerated locally. Post-application inspection confirmed the migration and all four enum values.

Only approved target: PostgreSQL 17.4, `127.0.0.1:55439`, database `loadpacket_finance_verified_test`, data directory `C:/Users/User/Documents/loadpacket/test-results/finance-postgres`. An explicit isolated Prisma configuration was created under ignored test evidence; `apps/api/.env` was not used as the migration target. No other migration or database was changed. The first guard attempt stopped harmlessly because PostgreSQL returned the address with `/32`; the corrected identity query used `host(inet_server_addr())` before any migration ran.

Rollback: retain additive enum values and use a compatible application/forward fix. Never reopen cancelled loads or delete their audit events to accommodate an old reader. Do not remove enum values after use without a separate reviewed data/dependency migration.

## Implemented transitions

- OWNER/DISPATCHER only: `GET /loads/:id/management`, `POST /loads/:id/correct`, `/unassign`, `/cancel`, and the existing `/assign-driver` command. All commands require a UUID idempotency key, expected-state token and a trimmed 3–1000 character reason. Tenant scope comes from authentication.
- Corrections: BOOKED, no current assignment or ASSIGNED only. Accepted loads must first be explicitly unassigned. Allowlist: broker contact, equipment, pickup/delivery facility/address/appointment/reference, linehaul, fuel surcharge, total rate and payment terms. Stop correction requires exactly one stop of the selected type. Unknown/nested identity fields are rejected.
- Unassignment: BOOKED + ASSIGNED or ACCEPTED. Retires the current assignment without clearing its timestamps; appends its historical snapshot.
- Cancellation: BOOKED, with no current assignment or ASSIGNED/ACCEPTED. Atomically sets load CANCELLED, retires an actionable assignment, and records the required reason. No reopening command.
- Assignment/reassignment: eligible BOOKED loads only, same-tenant active Driver, Driver lock before load lock. Every reused outgoing active assignment is snapshotted, including same-Driver reassignment. An already retired assignment's earlier snapshot remains intact.
- IN_TRANSIT, DELIVERED, PAYMENT_READY, INVOICED, PAID, completed assignments and recorded stop execution reject ordinary management. Financial evidence independently freezes management even when status incorrectly remains BOOKED.

Financial freeze checks cover invoice number/issue/submission, paid evidence, payment rows, invoice documents/current invoice requirement versions, posted financial records, approved/billed charges and executed agreements. No invoice PDF, document version/checksum, payment, approved charge, financial record or balance is edited. Rate calculation reuses Decimal validation; payment terms preserve B1a's explicit 0–365 policy and issued evidence protections.

Commodity, free-form load instructions and stop-specific contact fields are intentionally outside this approved existing-column slice; they were not invented in JSON or unrelated columns. No additional schema is needed for the implemented allowlist.

## History, tokens and idempotency

Management events carry `schemaVersion: 1`, reason, actor/time, before/after state, outgoing assignment ID/Driver/status/timestamps, request fingerprint/key and original result. Current assignment storage retains its existing unique load key. Historical events are append-only. Previously overwritten legacy details cannot be reconstructed and are not fabricated.

Expected management tokens represent the current load, assignment and evidence state, rather than load.updatedAt alone. Mutation checks and audit writes share the tenant-scoped load row lock. Exact same-actor, same-key, same-payload retries return the stored result without repeating writes; changed payload/actor conflicts. Duplicate cancellation was verified concurrently.

Driver detail returns a separate action token bound to tenant/load/Driver, assignment ID, ISO assigned timestamp and relevant assignment/correction event IDs. It stays stable through normal execution but changes on correction, retirement or reassignment. Detail and token are read under one load lock. Accept, start, complete, stop updates and document capture validate it under that lock before executing or replaying a prior result. A former Driver gets 404; an invalid/missing token for a matching assignment gets 409. Same-Driver reassignment cannot reactivate an old request.

Owner dashboard/detail consistently exclude retired assignments from current Driver display and show CANCELLED status. Owner load detail exposes management history and before/after evidence. Driver list responses add read-only historical relationship summaries with their own accepted/completed timestamps; web/mobile display them separately from actionable work. History omits rates, reasons, other drivers and later operational details. Existing completed assignment records remain visible and unchanged.

## Web UX and mobile compatibility

Existing load detail now includes eligibility explanations, correction fields, required reasons, destructive confirmations, busy/error/retry states, explicit conflict refresh and change history. Assignment also requires a reason and preserves request identity on retry. Existing layout/components/styling are reused.

Driver web/mobile callers send the action token for workflow/stop/upload requests. A failed mobile refresh clears stale action data. Retried uploads retain their original token rather than borrowing a refreshed assignment's token. Old clients without tokens fail safely with a refresh/update message and cannot mutate loads; operational use of those clients requires the updated client release. Cancelled assignments leave actionable lists. No native build, device test, store work, deployment or offline queue was performed.

## Test results

- **28 unit tests passed:** B1b command fingerprint/term validation plus B1a invoice terms and billing packet tests.
- **169 existing HTTP tests passed across targeted suite reruns:** authentication/tenant isolation, company/Driver assignment, stop events, document review and the production-workflow test fixture. Existing test clients were updated for the required tokens; assertions were retained. One run encountered a local setup timeout; the affected suites passed with a 30-second runner timeout, without disabling tests.
- **10 B1a invoice HTTP tests passed.**
- **13 B1b isolated database/HTTP groups passed:** authorized corrections, audit/precision/zero terms, role/tenant/allowlist/boundary validation, duplicate/conflicting requests, stale actions, financial and document immutability, completed history and Owner/Driver projection consistency. Four races each ran three times with alternating request order: edit/accept, cancel/start, unassign/reassign and same-Driver reassign/stale accept. Exactly one operation won each race. No storage writes occurred in this harness.
- **8 B1a isolated database groups passed, plus cleanup:** distinct tenant sender identities, defaults/overrides, PDF/packet/A/R agreement, immutable historical PDFs/checksums/terms and concurrent invoice generation.
- **2 browser tests passed:** B1b real Nest API + synthetic memory persistence correction/unassignment/stale-conflict recovery/cancellation journey, and B1a billing-term UI regression. Concurrency claims come from PostgreSQL tests, not the browser fixture.
- **4 focused mobile tests passed:** request replay, account-switch rejection, network/multipart behavior and cancelled-load grouping.
- API/web/mobile typechecks and changed TypeScript/TSX lint passed. CJS launcher syntax check passed; it is outside the existing type-aware ESLint project. Migration SQL, report/changed-file whitespace and `git diff --check` checked. No full monorepo regression.

Evidence: ignored `test-results/load-corrections/migration-identity.json`, `results.json`, `files.json`, and the explicit isolated migration guard/config; B1a evidence remains under `test-results/invoice-terms/`. Browser traces on failed development attempts remain under the existing ignored web test-results directory. Test corrections addressed strict alert locators, unspecified stop row ordering and cloned-Date token representation; final results above reflect passing reruns.

Repeat B1b database/HTTP gate only while the exact verified cluster is running:

```powershell
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55439/loadpacket_finance_verified_test'
$env:RUN_LOAD_CORRECTIONS_TESTS='1'
node apps/api/test/load-corrections.database.cjs
```

The checked-in launcher verifies host, port, database and data directory, switches to ignored evidence before importing PrismaService, and never runs migrations. Use the repository's Node 24 runtime. Do not substitute an application/provider database.

## Files changed

This task changed 38 source/test/schema/report files; pre-existing workspace changes were preserved. Local generated Prisma client output was also refreshed (ignored).

- `apps/api/prisma/migrations/20261021120000_load_management_events/migration.sql`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/autopilot/autopilot.service.ts`
- `apps/api/src/documents/driver-document-capture.service.ts`
- `apps/api/src/drivers/driver-action.dto.ts`
- `apps/api/src/drivers/drivers.controller.ts`
- `apps/api/src/drivers/drivers.service.ts`
- `apps/api/src/drivers/me-driver.controller.ts`
- `apps/api/src/drivers/stop-event.dto.ts`
- `apps/api/src/drivers/stop-events.service.ts`
- `apps/api/src/loads/assign-driver.dto.ts`
- `apps/api/src/loads/load-action-token.spec.ts`
- `apps/api/src/loads/load-action-token.ts`
- `apps/api/src/loads/load-management.dto.ts`
- `apps/api/src/loads/load-management.service.ts`
- `apps/api/src/loads/loads.controller.ts`
- `apps/api/src/loads/loads.module.ts`
- `apps/api/src/loads/loads.service.ts`
- `apps/api/src/loads/owner-dashboard.service.ts`
- `apps/api/test/auth.e2e-spec.ts`
- `apps/api/test/company-drivers.database.ts`
- `apps/api/test/company-drivers.e2e-spec.ts`
- `apps/api/test/document-review.e2e-spec.ts`
- `apps/api/test/load-corrections.database.cjs`
- `apps/api/test/load-corrections.database.ts`
- `apps/api/test/production-workflow.e2e-spec.ts`
- `apps/api/test/stop-events.database.ts`
- `apps/api/test/stop-events.e2e-spec.ts`
- `apps/api/test/support/database-fixture.ts`
- `apps/mobile/app/(driver)/index.tsx`
- `apps/mobile/app/(driver)/loads/[loadId].tsx`
- `apps/web/src/app/driver/loads/[loadId]/page.tsx`
- `apps/web/src/app/driver/page.tsx`
- `apps/web/src/app/loads/[loadId]/page.tsx`
- `apps/web/src/components/load-management.tsx`
- `apps/web/test/load-corrections.spec.ts`
- `docs/features/LP-PRODUCT-B1b-load-corrections.md`
- `packages/api-contracts/driver.d.ts`

## Remaining blockers and cleanup

No blocker remains for the authorized local B1b gate. Broader release dependencies remain: migrate any other environment only with separate explicit authorization, ship compatible API/web/mobile clients together, and perform installed-device acceptance before claiming native release readiness. No production readiness claim follows from this local result.

The harnesses removed only their randomly identified synthetic tenants and verified removal. The existing isolated PostgreSQL cluster was started for this task, then stopped; `pg_ctl status` confirmed no server running. Its data directory and applied test migration were retained. Playwright stopped its fixture servers. No production access, customer data, cloud resources, paid services, dependency upgrades, commit or push. B1c was not started.
