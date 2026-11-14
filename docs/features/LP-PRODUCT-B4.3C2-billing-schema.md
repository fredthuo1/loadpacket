# LP-PRODUCT-B4.3C2 — additive billing persistence

Status: IMPLEMENTED, OFFLINE VALIDATION ONLY. No database was contacted, no migration applied, no enrollment/backfill performed, and no live billing enforcement or provider integration was added. Physical iPhone acceptance remains deferred; Driver Pro is unchanged.

## Scope and records

Seven new Prisma models/tables, with inverse relation fields only on existing Organization, User, Driver, Load and LoadEvent models:

- OrganizationSubscription: organization primary key, explicit UNKNOWN/GRANDFATHERED initialization, monotonic enrollment, immutable first-trial timestamp, revision, plan snapshot/version, monthly/annual cadence, paid period, failure episode and period-end cancellation.
- OrganizationBillingCustomer: immutable external customer ownership, unique by provider/environment/provider-account/customer reference.
- OrganizationBillingLink: immutable subscription ownership with one-way retirement; unique external subscription scope and one current link per organization. Composite customer FK also binds provider/environment/account.
- OrganizationBillingEvent: globally scoped delivery/command key, immutable canonical input/hash, actor/mapping evidence and one-time terminal outcome. Applied subscription revisions are unique per organization.
- OrganizationUsageBucket: capability/window identity, explicit nullable limit, used/reserved counters and configuration audit. No business quota or price is supplied by the migration.
- OrganizationUsageReservation: tenant operation key/hash, quantity, reservation and one immutable terminal outcome with evidence.
- AssignmentEntitlementGrant: immutable assignment occurrence, Driver/load/tenant snapshots, decision evidence and subscription/policy revision.

Existing migration files, tables, columns and constraints are preserved. No existing organization is silently grandfathered; cohort selection and initialization remain an explicit future operation.

## SQL protections and transaction obligations

The migration wraps generated DDL and manual guards in BEGIN/COMMIT. All new tenant-owned records contain organization_id; foreign keys use tenant-qualified existing keys, and retention uses RESTRICT rather than cascade deletion.

Subscription inserts/updates require a matching finalized audit at transaction commit. Before/after snapshots must use the database's canonical `to_jsonb(row)` representation, including timestamps; do not compare independently formatted JavaScript date strings. Revisions advance once. Trial history cannot reset or reactivate. Enrollment cannot clear. Failure clocks cannot move until an audited ACTIVE recovery clears them. ACTIVE state audits require SYSTEM or PROVIDER origin; there is no client paid-status API.

Provider names/accounts are opaque mappings, not integrations. OWNER/OPERATION receipt actors must be active same-tenant users; OWNER also requires the existing Owner role. Source namespaces are generated server-side: organization UUID for application/system commands, PostgreSQL `jsonb_build_array(provider, environment, provider_account_id)::text` for provider events. Never accept actor, namespace, payment status or tenant ownership from a browser payload. Receipt signature verification/reconciliation is future integration work, not implemented by these database fields.

Final receipts, provider customers, retired links, grants and terminal reservations cannot be rewritten or deleted. No retention purge, card data, secret storage or raw provider payload retention is introduced. An application retry must compare the existing actor, normalized input and fingerprint before returning a recorded event result; a unique-key conflict alone is not evidence of an equivalent command.

Statement-level guards also reject TRUNCATE on all seven new tables. These protections do not defend against a database owner/superuser disabling triggers or changing DDL. A later runtime-role review must prohibit those privileges; no roles or grants were changed here.

Quota reservation triggers lock the tenant bucket, enforce capacity, and update reserved/used counters transactionally. Exact operation retries suppress insertion before touching counters; conflicting retries fail. A terminal reservation can commit or release once. Deferred checks reconcile counters against the retained reservation ledger. Overlapping windows cannot be inserted to reset usage. Limit changes require another finalized Owner/System QUOTA_CONFIG event and never erase usage. Counter integer bounds are JavaScript safety limits, not commercial quotas. Callers must prove a domain outcome before release; no timeout automatically releases a reservation.

Lock order for future participating commands: organization -> subscription -> Drivers -> loads -> buckets -> reservations. The database guards do not replace this caller obligation. Quota checks, the actual domain mutation and audit must share a transaction; an async job needs a durable reservation and outcome reconciliation. No application services are wired to these tables in this ticket.

Grant insertion verifies the current tenant/Driver/load/assignment snapshot and subscription revision. A generation fingerprint uses PostgreSQL JSONB text of `[organization UUID, load UUID, Driver UUID, assignment UUID, assigned UTC epoch milliseconds, sorted assignment/unassignment/cancellation event UUIDs]`, hashed with built-in SHA-256. Compute it using the same database expression; ordinary JavaScript JSON serialization is not interchangeable with JSONB text. LOAD_CORRECTED is deliberately excluded from the entitlement occurrence, while the existing B1b action token continues to include corrections and must still be checked. Reassignment rotates the occurrence even for the same Driver and same millisecond. Legacy grants require an explicitly grandfathered organization and SYSTEM audit. Grants do not bypass Driver revocation, assignment authorization or private-document permissions. The backend still must evaluate B4.3B before recording a positive decision.

## Offline generation and validation

`prisma.billing-test.config.ts` imports no dotenv and never reads DATABASE_URL. It requires an explicit mode. Offline mode omits the datasource entirely; database commands cannot fall back to the application's connection. No client regeneration is needed until a later service implementation uses the models.

The installed Prisma 7.10.0 Windows CLI returned exit 0 and no SQL when its datasource was omitted. Its installed schema engine successfully performed the schema-only diff with `--datasource {}`. `prisma/billing-offline-diff.cjs` reproduces that operation using only schemaDatamodel inputs, no URL, an allowlisted credential-free child environment and a 20-second timeout. Output is restricted to ignored test-results so it cannot overwrite a reviewed migration. Both generation runs produced identical SQL. No dependency/tooling upgrade was made.

Run from repository root with Node 24 on PATH:

```powershell
$env:LOADPACKET_BILLING_CONFIG_MODE='offline'
pnpm --config.verify-deps-before-run=false --filter api exec prisma validate --config prisma.billing-test.config.ts
pnpm --config.verify-deps-before-run=false --filter api exec node prisma/billing-offline-diff.cjs ../../test-results/billing-schema/schema.before.prisma prisma/schema.prisma ../../test-results/billing-schema/repeated-generated.sql
pnpm --config.verify-deps-before-run=false --filter api test --runInBand --runTestsByPath src/organization-billing/billing-persistence.spec.ts src/organization-billing/entitlement-policy.spec.ts
pnpm --config.verify-deps-before-run=false --filter api typecheck
git diff --check
```

The saved pre-change schema is local ignored evidence; archive it with the review evidence before cleanup. Do not substitute the current schema as both diff inputs. Reviewed manual guards are retained in the migration and are not regenerated by the schema-only diff.

One diagnostic `prisma migrate diff --help` invocation auto-loaded the normal Prisma config before showing help. It performed no database operation and printed no connection values. Validation and all diff attempts explicitly used the isolated offline config or the credential-free native engine helper; future invocations, including help, must specify the offline config.

## Exact isolated database prerequisites — approval still required

The allowlist is a proposed test target, NOT proof that it exists or authorization to connect:

- Host: 127.0.0.1; port: 55439; database: loadpacket_billing_verified_test.
- It must be a dedicated, disposable synthetic billing database. The existing loadpacket_finance_verified_test database and the application's configured database are excluded.
- Confirm the cluster's actual resolved data directory (historically test-results/finance-postgres), owning process, PostgreSQL version and system identifier. Do not assume this historical path is still correct. Record an approved identity manifest before connection.
- Approve creating the dedicated database, if absent, on that verified cluster, plus a private test-only role/credential. None was created here. Do not put credentials in the report, command arguments or tracked files.
- After separate connection approval, verify `current_database()`, `inet_server_addr()`, `inet_server_port()`, `current_user`, `current_setting('data_directory')` and `pg_control_system().system_identifier` against the manifest. A matching URL alone is insufficient. Stop on any mismatch, insufficient identity evidence or unavailable cluster; do not use another port or database.
- The dedicated Prisma config accepts only the exact allowlisted PostgreSQL URL with explicit username/password and no query parameters. Provide it privately through LOADPACKET_BILLING_TEST_DATABASE_URL; set LOADPACKET_BILLING_CONFIG_MODE=isolated only after approval. This is a routing check, not independent identity verification.
- Review the complete migration SQL and all existing pending migrations first. A fresh empty dedicated database requires separately approving replay of the unchanged baseline migration chain. `migrate deploy` applies all pending migrations; it must never be described as applying only this migration unless the baseline has already been verified as applied.
- Only after those checks may `prisma migrate status/deploy --config prisma.billing-test.config.ts` and database tests run. Never run migrate reset or use the normal prisma.config.ts. No shadow database is needed for the schema-file diff.

## Remaining database acceptance

Offline results: Prisma schema validation PASS; 24 focused isolation/DDL static tests and all 69 B4.3B policy tests PASS (93 total); API TypeScript PASS; changed TypeScript/config ESLint PASS; offline helper syntax check PASS; git diff and new-file whitespace checks PASS. The two engine-generated schema diffs match byte-for-byte. SHA-256 checks confirmed all 23 pre-existing migration files, the normal Prisma config, mobile package manifest, workspace lockfile and B4.3B policy stayed unchanged. These are static checks, not PostgreSQL execution results.

Changed files: prisma/schema.prisma; the single 20261111120000_organization_billing_persistence/migration.sql; prisma.billing-test.config.ts; prisma/billing-test-target.ts; prisma/billing-offline-diff.cjs; src/organization-billing/billing-persistence.spec.ts; and this report (paths relative to apps/api except this docs report).

Static validation cannot prove PostgreSQL trigger compilation or transaction behavior. Before production consideration, test the migration on the approved isolated target, including direct SQL attacks, cross-tenant FKs, concurrent trial claims, immutable trial/ownership/audit history, duplicate/conflicting events, last-slot quota races, rollback, repeated commit/release, counter tampering, overlapping windows, plan downgrade preservation, same-Driver stale grants and membership/assignment races. Use synthetic records only and preserve baseline migration checksums.

Before service work, approve quota units/windows and actual plan configuration, trial eligibility for previously paid organizations that never used a trial, explicit grandfathering/legacy-grant cohorts and the enrollment/grant recording rollout. Provider selection/activation, authenticated APIs and live enforcement are separate work. These decisions are not inferred by this schema.
