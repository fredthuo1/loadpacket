# LP-PRODUCT-B2 — Carrier onboarding and access administration

Result: **PASS — local product acceptance.** October 30, 2026.

## Implemented behavior

- One onboarding model: Supabase identity registration/sign-in → verified provider email → atomic organization and initial OWNER creation → existing Company Profile → product entry. Unmapped authenticated users receive `ACCOUNT_SETUP_REQUIRED`; login preserves their session and opens setup. A provider-only identity can retry setup without database administration.
- Identity-scoped transaction locking plus the existing unique auth identity make concurrent provisioning and lost-response retries return one organization/membership. An inactive membership cannot provision another organization.
- Existing Company GET/PATCH handles business identity, address, contact details, timezone and payment terms. Setup explains invoice identity/default terms without imposing a second profile or optional questionnaire.
- Owner-only Team & Access shows office members and the latest 100 invitations; creates BACK_OFFICE/DISPATCHER invitations; revokes/reissues pending links; changes existing office roles (including explicit Owner promotion); and soft-revokes membership. Driver accounts and their invitation workflow remain separate and unchanged.
- Invitations use a random 256-bit opaque secret, SHA-256 hash at rest, canonical verified email, server-selected tenant/role, seven-day expiry, immutable terminal history and composite tenant/actor FKs. Raw links are returned only on creation/reissue, in a URL fragment removed after reading. Owners share the link privately; the application does not claim to send staff email.
- Acceptance uses verified identity/email and the authoritative hashed-token record, locks the organization, and creates or explicitly reactivates the matching same-tenant identity. Concurrent/consumed retries return the existing active membership; consumed invitations cannot restore revoked access. A fresh invitation is required. An identity already mapped to another tenant cannot join or inspect the invitation.
- Access mutations reread active Owner authority after acquiring the organization lock. The final active Owner cannot be revoked/downgraded. Database triggers independently guard that invariant and immutable membership identity/tenant ownership.
- Forgot password submits to the existing provider SDK with a neutral response; PKCE callback exchanges the code, reset updates the provider password, signs out, and allows sign-in again. Existing Driver OTP invite/recovery callback targets remain intact; signup and explicitly targeted reset confirmations are supported. Redirect targets are allowlisted relative paths.
- Existing components/styles, labels, busy states, errors, refresh/retry, and scroll-contained tables are reused. Browser acceptance covers 390px page overflow.

## Retry and history policy

Access commands use per-organization UUID request keys and canonical request digests, persisted with the existing `FinancialAuditEvent` infrastructure under `ACCESS_ADMIN`. Conflicting reuse is rejected. Audit evidence includes actor, target, prior/resulting state and timestamp; raw tokens/passwords are absent. Access audit and invitation history cannot be silently rewritten/deleted.

For security, a replayed invitation-creation response returns the invitation metadata with `invitePath: null`; plaintext secrets cannot be recovered from storage. The UI explicitly offers reissue when the original response/link is lost. Reissue creates a new record and invalidates the previous pending link. Staff removal preserves the User and historical financial/document FKs. B1 financial, invoice, settlement and load-action semantics are unchanged.

## Schema and migration

Migration required: **YES** — `apps/api/prisma/migrations/20261030120000_carrier_access/migration.sql`.

One new `StaffInvitation` table and additive constraints/indexes/triggers: pending-email uniqueness, state/role validation, tenant/actor FKs, immutable invitation/audit history, scoped audit request keys, final-Owner guard and membership identity/tenant immutability. All existing enum values, columns and tables retained. No historical financial data rewritten.

Applied only to PostgreSQL 17.4 at `127.0.0.1:55439/loadpacket_finance_verified_test`, data directory `C:/Users/User/Documents/loadpacket/test-results/finance-postgres`. Before application: exact identity checked, all 20 prior migration checksums verified, SQL inspected and exercised transactionally with rollback. Only the new migration was applied; all 21 checksums reverified and local Prisma client regenerated. No `apps/api/.env` migration target, resets or historical migration launcher reruns. Nothing applied outside this isolated database.

## Security and provider evidence

Bootstrap endpoints deliberately precede membership, but manually verify the bearer identity through the existing TokenVerifier and then require the provider's confirmed email; browser metadata is never authority. Protected administration uses existing global auth/role guards plus transaction-time Owner checks. Cross-tenant IDs are rejected or scoped out. Global identity lookup is limited to existing bootstrap/identity invariants. Provider failures are sanitized. Private responses are non-cacheable and auth callback routes suppress referrers.

**Real provider signup/email/recovery delivery was not tested or authorized.** Unit/HTTP tests use fictional identity adapters. The main B2 browser flow mocks only a local Supabase-compatible provider boundary; the actual Supabase SDK, API verification adapters, Nest controllers/guards/services and isolated PostgreSQL memberships remain real. Its synthetic PKCE exchange validates the code challenge, updates a fictional password and proves sign-in with the new password. No real email was sent and no delivery claim is made. The three existing Driver browser cases retain their existing deterministic fixtures.

## Targeted test evidence

- Unit: **32 passed**, 3 suites — 7 B2 boundary tests plus 25 existing token/bootstrap tests. Confirmed versus unconfirmed/anonymous provider identities, sanitized provider failure, opaque token hash, names and exact expiry boundaries.
- Existing HTTP/API compatibility: **169 passed**, 4 suites — `auth.e2e-spec.ts`, `company-drivers.e2e-spec.ts`, `driver-invitations.e2e-spec.ts`, `invoice-terms.e2e-spec.ts`.
- New real-database acceptance: **12 groups passed / 68 HTTP requests** through the actual Nest application. Exact database identity/all checksums; three simultaneous provisioning requests; retry after lost response; company setup; invitation role/tenant/token tampering; concurrency/idempotency; cross-tenant actions; permission updates and B1d finance access; revocation/rejoin; expiry/reissue; three revoke-versus-accept races; sole Owner API/database guards; two Owners concurrently removing one another; independent direct-database concurrent downgrades; immutable audit/invitation history.
- B2 browser: **1 end-to-end journey passed** — register/provision, company update, invite/accept a second identity, role change/removal, last-Owner rejection, recovery request/PKCE reset/new-password login, 390px overflow checks. Real application/database; only provider boundary simulated.
- Existing Driver callback compatibility: **3 passed across focused runs** — SSR invite/password activation, pending-Driver recovery, and expired/missing/unsupported callback/open-redirect checks. Signup is now intentionally supported, so its prior unsupported-type expectation was replaced by `email_change`, with additional signup and missing-code redirect assertions. The two unaffected passing cases were not redundantly rerun after changing only the third test.
- API and web typechecks: passed. Changed-area API and web lint: passed, including the final supplemental browser assertions.
- `git diff --check`: passed. Explicit whitespace scan: **32 maintained B2 files passed**, including untracked files.

Ignored evidence: `test-results/access/identity.json`, `test-results/access/results.json`, local synthetic database records and browser output. Fixtures/audit records are retained for inspection; no customer data exists in them.

### Repeatable targeted commands

From repository root, use installed Node 24 and pnpm 12.3.4. The database acceptance launcher refuses any other host/port/database and changes working directory before importing PrismaService so application `.env` files are not loaded. Start only the verified isolated cluster before running it; do not rerun the one-time migration launcher.

```powershell
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55439/loadpacket_finance_verified_test'
$env:RUN_ACCESS_TESTS='1'
node apps/api/test/access.database.cjs
pnpm --filter api exec node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/auth/access.spec.ts src/auth/supabase-token-verifier.spec.ts src/auth/bootstrap-auth.spec.ts
pnpm --filter api exec node --experimental-vm-modules node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand --runTestsByPath test/auth.e2e-spec.ts test/company-drivers.e2e-spec.ts test/driver-invitations.e2e-spec.ts test/invoice-terms.e2e-spec.ts
pnpm --filter web exec playwright test --config playwright.access.config.ts
pnpm --filter web exec playwright test test/invitations.spec.ts --grep 'SSR invite confirmation|expired, missing|confirmed but pending' --config playwright.config.ts
pnpm --filter api typecheck
pnpm --filter web typecheck
git diff --check
```

The B2 Playwright config owns local ports 3100/3104/3105 and stops its servers. Do not run it concurrently with the existing browser config, which also uses 3100. No production/provider environment values are needed for these fixtures.

## Maintained files changed for B2

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20261030120000_carrier_access/migration.sql`
- `apps/api/src/auth/access.controller.ts`
- `apps/api/src/auth/access.dto.ts`
- `apps/api/src/auth/access.service.ts`
- `apps/api/src/auth/access.spec.ts`
- `apps/api/src/auth/account-identity-provider.ts`
- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/test/access.database.cjs`
- `apps/api/test/access.database.ts`
- `packages/api-contracts/access.ts`
- `apps/web/src/components/account-access.tsx`
- `apps/web/src/components/auth-provider.tsx`
- `apps/web/src/components/app-header.tsx`
- `apps/web/src/lib/auth/types.ts`
- `apps/web/src/proxy.ts`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/app/auth/register/page.tsx`
- `apps/web/src/app/auth/start/page.tsx`
- `apps/web/src/app/auth/staff/page.tsx`
- `apps/web/src/app/auth/forgot/page.tsx`
- `apps/web/src/app/auth/reset/page.tsx`
- `apps/web/src/app/auth/callback/route.ts`
- `apps/web/src/app/auth/confirm/route.ts`
- `apps/web/src/app/settings/company/page.tsx`
- `apps/web/src/app/settings/team/page.tsx`
- `apps/web/playwright.access.config.ts`
- `apps/web/test/access.spec.ts`
- `apps/web/test/access-provider-fixture.mjs`
- `apps/web/test/invitations.spec.ts`
- `docs/features/LP-PRODUCT-B2-carrier-access.md`

Unrelated pre-existing workspace changes preserved. Generated Prisma output and ignored evidence are excluded from this maintained-file list.

## Remaining limitations and next action

Local product acceptance is the qualification boundary. A deployment still needs its separately authorized migration and normal provider configuration: enabled email/password signup, working provider email service, correct site origin and allowed `/auth/callback` redirects, and existing Driver confirmation templates preserved. Those provider settings and real email delivery remain unverified. Staff links are Owner-shared, not automatically emailed. One provider identity continues to belong to one organization; no cross-tenant transfers or identity replacement are provided. Team invitation history is capped at the latest 100 rows while durable database evidence remains intact. Denied commands return errors without persisting a separate denial audit, consistent with transactional rollback; successful access changes are audited.

Cleanup complete: exact isolated identity and all 21 migration checksums verified again; task-started PostgreSQL stopped (`pg_ctl: no server running`, expected status 3); test ports 3100/3101/3102/3104/3105/55439 have no listeners. Synthetic records, immutable audit evidence and local files retained. Cleanup evidence: ignored `test-results/access/cleanup.json`.

No unresolved local implementation blockers. No production access, deployment, paid services, commit/push, broad regression or B3 work. Review this completed B2 report; B3 requires a separate instruction.

