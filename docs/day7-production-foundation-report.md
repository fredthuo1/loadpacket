# LoadPacket Day 7 — Production Foundation

Date: 2026-09-20. Repository: `C:/Users/User/Documents/loadpacket`.

## Day 7 result

**PARTIAL — implementation and automated release gate pass; deployment/provider configuration and live acceptance remain.** Overall ledger status: `IMPLEMENTATION_COMPLETE_MANUAL_ACCEPTANCE_REQUIRED`.

7A Company/Driver Management: COMPLETE. 7B Invitations: COMPLETE implementation. 7C Document Vault: COMPLETE. 7D Review/Compliance: COMPLETE. 7E Canonical Readiness: COMPLETE. 7F Billing/Payments: COMPLETE. 7G Validation: COMPLETE. 7H Dashboard: COMPLETE. 7I Automated Regression: COMPLETE. Live Supabase invitation/email acceptance is explicitly pending.

No commit, push, deployment, database reset or seed was performed. Pre-existing workspace changes and operational data were preserved. This report supersedes historical intermediate test-status statements in earlier reports.

## Architecture

The modular Nest monolith remains authoritative. Supabase verifies identity; the API resolves an active application User, organization, role and optional Driver mapping. Services enforce business rules and transaction boundaries. Next.js uses authenticated API requests and role-aware navigation. Prisma 7 with the PostgreSQL adapter remains in place.

Operational path: company/driver setup → server-side invitation → password-authenticated onboarding → assigned driver load execution → immutable evidence capture → human review → deterministic readiness → immutable invoice → billing → append-only payments and remaining A/R. AI extraction remains advisory; manual load creation and paperwork operations remain usable without AI.

## Database changes

All 12 migrations are applied. The remaining Day 7 work added four forward migrations; earlier authentication and 7A migrations were preserved.

- `20260919140000_add_driver_invitation_flow`: DriverInvitationStatus PENDING/ACCEPTED/CANCELLED; driver_invitations with tenant, driver, email, nullable Auth subject, state and send/accept/cancel timestamps. Unique driver and Auth-subject indexes, tenant/status index, composite Driver tenant key/FK, RLS and public-client privilege revocation.
- `20260920031500_add_business_document_vault`: CompanyDocumentType W9/CERTIFICATE_OF_INSURANCE/OPERATING_AUTHORITY/PERMIT/OTHER and DriverDocumentType CDL/MEDICAL_CERTIFICATE/MVR/OTHER. Explicit organization_documents and driver_documents with tenant-scoped context/type indexes, unique document links and composite tenant FKs. Document composite identity; DocumentVersion uploadedByUserId, uploadKey, issuedAt and expiresAt; per-tenant upload-key uniqueness, uploader tenant FK and date-order check. New tables have RLS and revoked public-client privileges.
- `20260920041000_add_document_review`: RequirementStatus REJECTED; DOCUMENT_REJECTED and DOCUMENT_WAIVED events. LoadRequirement currentVersionId, reviewedVersionId, reviewedByUserId, reviewedAt and bounded reviewReason. Version composite identity and tenant-scoped version/reviewer FKs.
- `20260920053000_add_payment_ledger`: LoadPayment tenant/load/amount/currency/idempotencyKey/recordedByUserId/recordedAt/createdAt. Decimal(12,2), positive-amount check, per-tenant/load/key uniqueness, chronological lookup index, tenant-scoped load/user FKs and Load composite identity. RLS/public-client revocations. Backfilled five explicit historical positive amountPaid values without altering original financial records; unknown historical actors remain null.

No schema migration was needed for 7E or 7G–7I. Exact SQL is retained in the migration directories and included in the file inventory. Final preservation fingerprints match every pre-existing business row/column: one organization, two users, one driver, five loads, 24 documents, 24 versions, 28 events and five historical payment entries, plus all other business tables.

## API routes added or changed

All business paths use `/api/v1`. The complete controller declaration inventory is in [day7-production-api-routes.md](day7-production-api-routes.md).

- Company: GET/PATCH `/company`; GET/POST `/company/documents`.
- Driver administration: GET/POST `/drivers`; GET/PATCH `/drivers/:driverId`; POST activate/deactivate/invite/invite/resend under that Driver.
- Identity: GET `/me`; POST `/me/complete-invitation`.
- Driver workflow: GET `/me/loads`, `/:loadId`, `/:loadId/autopilot`; POST accept/start/complete and documents/:documentType under `/me/loads/:loadId`. Legacy staff Driver-ID routes retain staff-only roles and validated commands.
- Vault: GET `/documents/vault`, `/:documentId`; POST `/:documentId/versions`, `/:documentId/versions/:versionId/download`. GET/POST `/drivers/:driverId/documents`. GET `/documents/vault-files/:ticket` authenticates through the expiring grant and rechecks current authorization.
- Legacy documents: GET `/documents/:documentId`; POST ratecon, :documentId/extract-text and :documentId/ratecon-draft. Sensitive driver-document access cannot bypass the vault rules.
- Review: GET `/back-office/loads/:loadId/requirements`; POST `/:requirementId/accept`, `/reject`, `/waive` under that path.
- Readiness/billing: GET `/back-office/queue`, `/back-office/loads/:loadId/readiness`, `/billing-packet`; POST `/back-office/loads/:loadId/carrier-invoice`, `/submit-billing`.
- Receivables: GET `/back-office/accounts-receivable`; POST `/back-office/accounts-receivable/loads/:loadId/mark-paid`, now requiring amountPaid and UUID idempotencyKey.
- Dashboard/load operations: GET `/owner/dashboard`, `/owner/loads/:loadId`, `/loads/dashboard`, `/loads/:loadId`; POST `/loads`, `/loads/manual`, `/loads/:loadId/assign-driver`.
- Existing agreement and Money Found mutations now validate empty commands/required text; Money Found amount/approve/dismiss revalidate under a row lock. Autopilot consumers use canonical readiness and Decimal totals.

## Web routes

Added/extended `/`, `/settings/company`, `/drivers`, `/drivers/new`, `/drivers/[driverId]`, `/documents`, `/auth/confirm`, `/auth/invite`, `/back-office/loads/[loadId]/review`, `/back-office`, `/back-office/accounts-receivable`, `/loads/[loadId]`, `/driver`, `/driver/loads/[loadId]`. Login/session/navigation and manual/RateCon load intake remain connected to the existing authenticated API. No mobile application was built.

## Auth and invitation flow

Only Owner can provision an active same-tenant Driver with an email. The server-only identity adapter rejects unsafe existing-account matches; it never links arbitrary identities by matching email. Invitation persistence and local user/driver mapping use transactions and locking; compensation is limited to identities created by that operation. Roster account state comes from local data, without a provider lookup per row.

PENDING accounts cannot operate loads. The callback verifies the provider token and creates a cookie session; password setup must result in a verified password-authenticated identity before completion changes PENDING to ACCEPTED. Completion is idempotent. Relative callback redirects preserve the browser host. Recovery supports interrupted onboarding; saved-password/API-failed retries are tested. Resend has a 60-second cooldown. Connected email is read-only in ordinary profile editing. Deactivation preserves identity/history and blocks operational access.

## Document architecture

One Document/DocumentVersion model and private storage adapter serve company, driver and load contexts. Every upload is new immutable evidence with SHA-256 checksum; corrections append a version. Upload actor/date/expiration metadata and history remain available. Vault validates content signatures, size, extension and metadata. Upload keys deduplicate retries and reject conflicting reuse. Exclusive filesystem writes prevent overwrite; cleanup preserves evidence when a database commit outcome is uncertain.

Download grants expire after 60 seconds and recheck account, tenant and document permissions. Files never get permanent public URLs. The local adapter uses the API working directory's `storage` folder; production needs a durable private volume or a later adapter replacement.

Review targets a specific current version. Owner/Back Office accept, reject or waive; rejection/waiver require reasons. Stale versions fail, retries do not duplicate events, and billed paperwork cannot be changed. Rejected driver evidence can be replaced while retaining the original. Packets use approved versions, omit waived requirements and fail visibly if approved evidence is unavailable.

Expiration is derived separately: valid through the expiration day, EXPIRING_SOON within 30 days, EXPIRED afterward; undated documents display NO_EXPIRATION.

## Exact readiness policy

REQUIRED MISSING, RECEIVED or REJECTED blocks billing; ACCEPTED or WAIVED satisfies it. CONDITIONAL requirements become applicable when evidence activates them (status differs from MISSING); untouched conditional requirements do not block. No applicable requirements means not ready. The policy returns structured requirement/type/status/reason blockers and is shared by queue, dashboard, Autopilot, invoice reconciliation, review, billing and packet generation.

Only a DELIVERED load with a passing policy becomes PAYMENT_READY, with one event under the load lock. A successfully generated immutable carrier invoice is intentionally auto-accepted; uploaded driver evidence requires human review. A file's mere existence cannot make a load ready.

## Financial and transition integrity

Billing locks and re-reads the tenant load, invoice and readiness inside one transaction. Repeats return the prior state without duplicate billing events.

Payments require a positive, bounded decimal amount and UUID operation key. Under the load lock, the service checks ledger/cache agreement, prevents overpayment, inserts one immutable ledger entry, updates cumulative amountPaid and records one event. Identical retries return the existing result; changed payloads with the same key fail. Partial payments retain INVOICED; paidAt and PAID are set only upon full settlement. A/R and Owner load detail subtract cumulative payments. The browser retains its key across a lost response.

Money Found decisions lock and re-read status, preventing duplicate decisions or approved amount edits. Driver accept/start/complete lock the load; assignment uses the same load lock and rechecks BOOKED. Real database tests verify duplicate transition event counts and assignment/deactivation races.

## Dashboard and tenant/role security

Owner receives active/inactive/pending Driver counts, review/paperwork blockers, expiring/expired documents, driver document-completeness attention, partial/overdue A/R, Money Found, recent activity and action links. Dispatcher gets an operational subset. Compliance attention checks dated CDL and medical-certificate evidence; it is not a legal compliance determination.

- Owner: company/driver administration, invitation, all vault contexts, review, billing, payments and dashboard.
- Dispatcher: driver/load operations, authorized company/load documents, operational dashboard; no identity provisioning, driver compliance documents, review or payment mutations.
- Back Office: company/load document reads, review, invoice/billing/A/R/payment and financial opportunity operations; no driver administration or company editing.
- Driver: authenticated own-load workflow and own driver documents; no arbitrary roster, tenant finance or self-approval.

Global guards deny undeclared roles. Tenant identity is database-derived, never supplied by clients. Cross-tenant resources return 404. DTOs reject unknown fields, malformed IDs and invalid/oversized text or money. Errors use controlled 400/401/403/404/409/429 responses. Signed downloads are the deliberate bearer-grant route; they still authorize every use.

## Verification and repeatable commands

All required checks passed:

- Prisma validate, generate and migrate status; 12 applied migrations.
- API typecheck, lint and production build.
- API unit tests: **68/68**, nine suites.
- API HTTP tests: **188/188**, eight suites.
- Web typecheck, lint and production build.
- Playwright: **22/22** browser tests.
- Isolated database management/driver and financial concurrency tests; original-data fingerprint comparison.
- Compiled API health/database checks, anonymous denial on protected routes and bearer CORS preflight.
- Source/browser credential audit: zero findings, 29 freshly built browser JS bundles scanned.

Normal commands (add this workspace's established pnpm store flags if needed):

```powershell
pnpm --filter api exec prisma validate
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate status
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api build
pnpm --filter api test --runInBand
pnpm --filter api test:e2e --runInBand
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web exec playwright test
node scripts/day7b-secret-audit.cjs
node scripts/day7-api-smoke.cjs
```

Installed dependencies here require `--store-dir C:/Users/User/AppData/Local/pnpm/store --config.verify-deps-before-run=false` before `--filter`. Database tests require opt-in: RUN_DAY7A_DATABASE_TESTS=1 for `test/company-drivers.database.ts`, RUN_DAY7_DATABASE_TESTS=1 for `test/payments.database.ts`, each run via `pnpm --filter api exec tsx`. They create isolated tenants, use real transactions, and clean up only their generated records. Surround them with `node scripts/day7-migration-preservation.cjs --before` and the same command without --before.

The unified HTTP golden path performs all customer mutations through endpoints without direct fixture edits or seeding. Its provider and persistence boundaries are mocked; it does not establish live email delivery. Browser tests separately exercise login, callback, password setup, refresh, invite recovery, company/driver management, review, vault, payments and dashboard. Actual DB tests independently verify real locks/constraints. Failure coverage includes anonymous/wrong role/tenant/driver, inactive assignment, active-load deactivation, duplicate/conflicting invitations, missing/unreviewed/rejected evidence, stale approvals, duplicate/concurrent transitions and billing, invalid/duplicate/concurrent payments, malformed DTOs and unknown fields.

## Manual external configuration and live acceptance

1. Set API-only SUPABASE_SECRET_KEY and WEB_APP_URL for the existing project; both were absent on the final configuration-presence check. Keep public Supabase settings pointed at that same project. Never put the admin secret in web/mobile or NEXT_PUBLIC variables.
2. Follow [day7b-report.md](day7b-report.md#manual-supabase-configuration): canonical Site URL, exact /auth/confirm and /auth/invite redirects, invite/recovery templates, expiration/password policy and production SMTP. Provider settings were not inspected or changed in a signed-in dashboard.
3. Set a production DOCUMENT_DOWNLOAD_SECRET of at least 32 characters and durable private storage. Keep credentials outside source control. Rotate the database credential previously exposed in the example file; the example is sanitized, and the actual local DATABASE_URL was left untouched.
4. As Owner, configure the company and add a fresh **D7 Production Test Driver** with a controlled email. Invite, receive email, set password and sign in; verify Connected state. Use a second designated pending account for resend/cooldown/recovery checks. Never repurpose Marcus.
5. Create a fresh marked load with BOL/POD/carrier-invoice requirements, assign the test Driver, accept/start, upload readable BOL/POD and complete. As Owner/Back Office, verify RECEIVED blocks billing, accept both versions, generate invoice and verify PAYMENT_READY. Download the packet, submit billing, record an authorized test partial amount, verify exact remaining A/R, then record the final amount and verify PAID. Use an isolated acceptance tenant when recording financial test transactions; do not alter historical business invoices.
6. Verify refresh/logout, own-load isolation and deactivation after completion. Record real email delivery and provider acceptance separately from automated results. No manual UUID linking or seed is part of this normal workflow.

## Files and deferred work

[Complete implementation source inventory](day7-production-files.md); [route inventory](day7-production-api-routes.md); per-phase reports day7a through day7h; [current progress ledger](day7-production-foundation-progress.md). The inventory includes pre-existing foundation files and does not attribute the entire dirty working tree to this continuation.

Deferred: Expo/mobile, RevenueCat, Broker Connect, geofencing/tracking, detention, EDI, IFTA/tax, accounting integrations, payroll/advanced settlements/full HR, social login, SSO, MFA and organization switching.

Remaining production limitations: live provider/SMTP acceptance is unverified; local storage must be durable and backed up; provider secret/download secret/redirect deployment settings require configuration; exposed credential rotation remains external. The installed runtime emitted a Supabase Node 20 deprecation warning; use a supported Node runtime for deployment and rerun the gate there. Automated fixture success is not evidence of deployed end-to-end acceptance.
