# Finance 500 — development/test activation

The configured database was missing `finance_records`, `financial_transactions`
and `financial_import_batches`. Prisma migrate status showed exactly two pending
migrations, and a read-only view query reproduced Prisma P2010 with PostgreSQL
SQLSTATE 42P01. This was an unapplied schema, not a temporary outage.

The initial implementation intentionally left that database unchanged. During
this follow-up the user explicitly confirmed:

> This database is development/test; apply the two Finance migrations

## Applied change

Ran `pnpm --filter api exec prisma migrate deploy` using the configured
development/test connection. Exactly these migrations applied:

- `20260927170000_finance_foundation`
- `20260927180000_finance_isolation`

`prisma migrate status` now reports the database schema is up to date.
Before/after counts and sorted row hashes match for all 20 pre-existing business
tables. No existing business data, environment file, authentication configuration,
production database or provider integration was changed. No reset or seed ran.

## Runtime verification

Read-only Finance service calls against an existing active Owner in the
configured database passed for overview, ledger, aging, broker profitability,
payroll preparation, audit, lookups, import history and an existing load's
financial summary. Business values, personal details and credentials were not
printed. Refreshing the existing Finance screen can now read its schema.

## Error-handling regression fix

- `apps/api/src/finance/finance-database.filter.ts`: Finance-only missing-table
  errors return 503 with the safe code FINANCE_SETUP_REQUIRED. Handles Prisma's
  adapter-nested SQLSTATE and older metadata shapes. Other errors delegate to the
  existing filter; raw SQL/connection details remain private.
- `apps/api/src/finance/finance.controller.ts`: applies the scoped filter.
- `apps/web/src/lib/api/finance.ts`: recognizes only the safe setup code for
  API requests/downloads; arbitrary server errors stay generic.
- `apps/web/src/app/finance/page.tsx`: explains incomplete setup, omits unusable
  mutations/exports, preserves the A/R link and allows checking after setup.
- `apps/api/src/finance/finance-database.filter.spec.ts`: six mapping/privacy cases.
- `apps/api/test/auth.e2e-spec.ts`: missing-schema response through actual Nest
  routing, including authentication and role checks before query execution.
- `apps/web/test/finance.spec.ts`: setup explanation and recovery after enabling.

API/web typechecks and builds passed. Targeted API/web lint passed after a test
formatting correction. All six filter tests and 77 authorization HTTP tests
passed. All six Finance browser workflows passed on the final run (22.1 seconds).
The first browser attempt hit Chrome ERR_NETWORK_IO_SUSPENDED before loading
Finance; the other five workflows passed and the suite was rerun without
weakening assertions. `git diff --check` passed.

The full expensive cross-product gate was not repeated for this targeted
activation/error-handling change. Existing full-gate evidence remains in the
implementation report. No mutations or fixture tests ran against business
records in the configured database; only the two authorized migrations did.
