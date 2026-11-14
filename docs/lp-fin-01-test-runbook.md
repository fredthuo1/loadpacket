# LP-FIN-01 isolated testing and acceptance

The configured development/test database received the two Finance migrations
after the user explicitly confirmed its environment and authorized them in the
Finance-500 follow-up. Automated integrity tests still use the separate local
database below; do not change apps/api/.env to run them. No production
deployment, provider integration, email, purchase,
tax filing or payroll processing is part of this work.

## Existing isolated database

PostgreSQL 17 tools: `C:/Program Files/PostgreSQL/17/bin`.
Local cluster: `test-results/finance-postgres` (ignored by Git).
Listener: `127.0.0.1:55439`; database: `loadpacket_finance_verified_test`.
This contains fictional test data only; it uses local trust authentication and
must remain bound to loopback. The finance test launcher refuses any other
hostname, port or database name. Never use `loadpacket_finance_test`, the earlier
partially initialized scratch database.

From the repository root, restart the already initialized cluster if needed:

```powershell
& 'C:/Program Files/PostgreSQL/17/bin/pg_ctl.exe' -D "$PWD/test-results/finance-postgres" -l "$PWD/test-results/finance-postgres.log" -o '-h 127.0.0.1 -p 55439' -w start
```

Run focused real HTTP/database checks:

```powershell
./scripts/finance-regression.ps1
```

Run all API, web, mobile and isolated database checks:

```powershell
./scripts/finance-regression.ps1 -Full
```

The wrapper restores the caller's environment afterward. It never migrates,
resets or seeds the configured application database. The Finance test creates
two fresh fictional tenants, exercises actual Nest guards/controllers/services
and PostgreSQL constraints, then deletes only its own fixtures. Existing mobile
integrity checks likewise create and clean their own isolated fixtures.
Full gate logs and JSON reports are under `test-results/regression/<timestamp>/`.

Optional: stop only this cluster after testing:

```powershell
& 'C:/Program Files/PostgreSQL/17/bin/pg_ctl.exe' -D "$PWD/test-results/finance-postgres" -m fast -w stop
```

## Recreate on another development machine

Install PostgreSQL and the repository's locked dependencies. Use a new empty
local cluster, loopback port 55439, and a database named exactly
`loadpacket_finance_verified_test`. Before applying migrations, create NOLOGIN
roles `anon` and `authenticated` in that **test cluster**, because an existing
Day 7 migration revokes permissions from those Supabase roles. This does not
grant them access. Set DATABASE_URL only in the command environment to the URL
above, and run `pnpm --filter api exec prisma migrate deploy` against that test
database. Never mark a failed migration applied or alter historical migrations.
The current verified test database already has all 16 migrations applied.

## Test layers and practical limits

- `apps/api/src/finance/import-parser.spec.ts`: real CSV/XLSX parser, formatting,
  mapping, formulas, limits, dates, Decimal and CSV injection protections.
- `apps/api/test/finance.database.cjs`: guarded launcher for
  `finance.database.ts`; real Nest HTTP endpoints and PostgreSQL, including
  authentication/roles, foreign tenant references, amount immutability, concurrent
  payments/import confirmation, A/R, provenance, reversal and exports.
- `apps/web/test/finance.spec.ts`: browser login, Finance navigation, actual UI,
  mapping/explicit confirmation, manual entry, corrections and error handling.
  Finance API responses are deterministic fixtures in this browser layer.
- Existing full release gate covers load/document/driver/billing/broker/mobile
  regressions. It does not prove live third-party configuration or native device
  behavior. Do not describe browser fixture data as real business records.

## Operator acceptance and demo

The configured application is now confirmed development/test and has both
Finance migrations applied. Use its existing authenticated Owner for acceptance;
use a fictional organization for the sample-data demo. The separate isolated
integrity database intentionally does not retain test accounts or grant real
Supabase identities access. Do not silently repoint the running application at
that cluster or run fixture-writing tests on the configured database.

1. Open Finance. Confirm no fabricated totals appear for an empty organization.
2. Download the CSV template. It contains one explicitly fictional delivery:
   DEMO-100 / Fictional Freight, September 20, 2026, gross USD 3,450.00 including
   USD 200.00 fuel surcharge, USD 612.44 fuel expense, USD 350.00 driver pay,
   USD 25.00 other costs, paid September 25. Use only a demo organization.
3. Upload it. Confirm no revenue appears before confirmation. Check mappings,
   preview, paid date and driver name. Explicitly confirm accurate records.
4. Select September 2026. Revenue is USD 3,450.00, costs USD 987.44, net
   USD 2,462.56, recorded receipts USD 3,450.00, outstanding USD 0.00 for this
   batch alone. Fuel surcharge is part of gross, not additional revenue.
5. Open a transaction: verify file, original row, column, checksum and original
   download. View the history entry. Re-upload identical bytes: existing batch
   opens and totals stay unchanged.
6. Add a USD 25.00 manual Parking expense. Open it and append a USD -5.00
   correction with a reason. Verify original evidence remains and total expense
   increases by net USD 20.00. Export the ledger.
7. Open Payroll Prep for September: imported driver pay USD 350.00 is traceable
   by source name, not automatically associated with a user account. Export it.
8. Open Tax Center for 2026: review annual categories and transaction CSV.
   This is preparation data, not a deduction decision or a filed return.
9. In an existing fictional invoiced load, follow Load Financials. Record a
   partial payment in existing A/R; confirm lower outstanding and higher receipts,
   with unchanged revenue. Check the audit and load links.
10. In a second organization verify no first-organization data is accessible.
    Driver/Dispatcher access to Finance must be denied.
11. Reverse a confirmed import that has no subsequent corrections. Confirm its
    totals disappear but evidence and reversal audit remain. Reversed reference
    numbers remain reserved; use corrections for retained financial history.

Manual business acceptance of this exact workflow remains operator work. The
automated browser and HTTP/database layers have separate documented coverage.
