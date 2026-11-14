# LP-FIN-01 — Updated Finance implementation and acceptance report

Date: September 27, 2026. Repository: `C:/Users/User/Documents/loadpacket`.
The P0 finance/import foundation and a bounded P1 reporting layer are implemented.
This is a candidate for operator Finance acceptance, not production deployment.
Initial migration/integrity work used a separate loopback-only test database.
In the Finance-500 follow-up, the user confirmed the configured database is
development/test and explicitly authorized its two Finance migrations. Both are
now applied; all 20 pre-existing business-table fingerprints are unchanged.
`apps/api/.env` itself was not edited.

**Current status:** Finance's required schema is installed in the configured
development/test database, and nine owner-scoped Finance read paths passed there.
The reported missing-schema 500 is resolved. The implemented foundation is ready
for human Finance acceptance; production release and the deferred features below
are not being declared complete. This report consolidates the implementation,
signed-CSV fix, authorized database activation and approved Finance styling.
The detailed activation record is `docs/lp-fin-01-activation.md`.

### Current delivery summary

- Finance foundation, historical CSV/XLSX imports, immutable corrections,
  provenance, A/R aggregation, payroll preparation, tax-category summaries and
  CSV exports are implemented.
- The configured development/test Finance activation is complete. The previously
  reported missing-schema 500 was resolved; no production database was changed.
- The approved styling is implemented: four primary metric cards, compact chart,
  receivables attention panel, recent activity, responsive ledger and consistent
  blue/white styling. The preview's fictional data is not part of the application.
- Latest UI validation: full web lint and typecheck PASS; eight Finance browser
  tests PASS. Desktop and 360px mobile screenshots were inspected.
- Earlier full release gate: 23/23 checks PASS. This predates the activation and
  styling follow-ups; it is not a new full-gate result for the latest source.
- Next: complete the Owner business-acceptance checklist in the configured
  development/test app, then continue separately scoped production preparation.

This report refresh reviewed repository checkpoints and existing test artifacts.
It did not rerun tests, execute migrations, deploy, commit or push code.

## 1. Repository Findings

The existing Nest modular monolith uses Prisma/PostgreSQL, tenant/role guards,
Decimal load rates, invoice fields on Load, an immutable LoadPayment ledger,
AccountsReceivableService, load-bound audit events, private document storage,
versioned evidence and the document Vault. Next.js already supplies authenticated
API requests, role-aware navigation and management forms. There was no active
standalone finance ledger, historical import staging, payroll preparation,
truck/mileage domain or chart/import framework. Empty packages/database/domain/
shared-types scaffolds were not populated with duplicate implementations.

## 2. Architecture Decisions

Reused authentication, authorization, Prisma, Decimal, A/R, payment recording,
load links, Vault and the existing UI theme. Added a Finance Nest module with
services for records/reporting and imports; controllers validate and delegate.
A SQL read projection unifies manual/import entries with existing invoices and
payments without copying operational revenue. Historical deliveries remain
separate from operational Loads, assignments and events. Original bounded
spreadsheets are stored privately in the import batch; this avoids changing the
existing immutable document pipeline. Native SVG plus an exact-value table
provides the monthly chart without a new visualization dependency.

## 3. Database Changes

Two additive migrations:

- `20260927170000_finance_foundation`: five models, five enums, indexes,
  composite tenant references, financial constraints, read view and immutable
  financial-entry trigger.
- `20260927180000_finance_isolation`: deny-by-default RLS/revokes and normalized
  historical/live duplicate guards, serialized per organization.

All 16 repository migrations applied from scratch to
`127.0.0.1:55439/loadpacket_finance_verified_test`. Older migrations and the
configured database were not modified during the initial implementation. The
subsequent authorized development/test activation applied exactly the two new
migrations to the configured database. New ORM relations on Organization,
User, Load, Driver and Document add no stored columns to those existing tables.

Activation commands were `pnpm --filter api exec prisma migrate deploy` followed
by `pnpm --filter api exec prisma migrate status`. Only the two pending Finance
migrations ran; status now reports the schema is up to date. Before/after row
counts and hashes matched for all 20 pre-existing business tables. No reset,
seed, environment-file change or production migration occurred.

New tables/columns (camelCase names below map to snake_case SQL):

- **FinancialTransaction / financial_transactions:** UUID id, organizationId,
  type, effect, category(100), amount Decimal(12,2), currency(3, USD),
  transactionDate DATE, description(500), memo(1000), vendorName(200),
  brokerName(200), optional loadId/driverId/documentId/historicalLoadId/
  importBatchId/correctionOfId UUID references, importRowNumber, sourceColumn(100),
  source, status, idempotencyKey(100), createdById and createdAt.
- **FinancialImportBatch / financial_import_batches:** UUID id, organizationId,
  fileName(200), fileChecksum(64), fileBytes, mimeType(100), JSON headers,
  columnMapping and counts, revision, status, createdById, createdAt, completedAt.
- **FinancialImportRow / financial_import_rows:** UUID id, organizationId,
  batchId, original rowNumber, status(20), JSON normalizedData and issues.
- **HistoricalLoadRecord / historical_load_records:** UUID id, organizationId,
  loadNumber(100), invoiceNumber(100), brokerName(200), deliveryDate DATE,
  origin/destination(300), miles Decimal(10,2), driverName(200), truckReference(100),
  grossRevenue Decimal(12,2), paymentStatus(20), dueDate DATE, importBatchId,
  importRowNumber, status, createdAt.
- **FinancialAuditEvent / financial_audit_events:** UUID id, organizationId,
  actorId, action(60), recordId UUID, recordType(30), summary(500), JSON details,
  createdAt.

Enums: FinancialType (INCOME, EXPENSE, PAYMENT, ADJUSTMENT, DRIVER_PAY),
FinancialEffect (INCOME, EXPENSE, PAYMENT), FinancialStatus (POSTED, VOID),
FinancialSource (MANUAL, IMPORT), FinancialImportStatus (DRAFT, PREVIEWED,
CONFIRMED, REVERSED). LOADPACKET is a projection source, not a stored ledger row.

Every table has its primary key and organization foreign key. Association and
actor/creator references include organizationId, with restricted deletion.
Transaction uniques: (id, organizationId), (organizationId, idempotencyKey).
Transaction indexes: organization/date/type, organization/category/date,
organization/load, organization/driver/date, organization/importBatch.
Batch uniques: (id, organizationId), (organizationId, fileChecksum); index
organization/createdAt. Row uniques: (batchId, rowNumber), (id, organizationId);
index organization/batch. History uniques: (id, organizationId),
(organizationId, loadNumber), (importBatchId, importRowNumber); index
organization/deliveryDate; additional case-insensitive trimmed load/invoice
unique indexes (invoice partial when non-null). Audit indexes:
organization/createdAt and organization/recordId.

Constraints require USD, nonzero amounts, positive ordinary entries, matching
type/effect, and source provenance; original files are limited to 5 MB. Updates
to financial entry amounts/details are rejected; reversal may set POSTED to
VOID. API corrections append entries. `finance_records` projects all records
with load/driver/broker/source associations. No raw table access is granted to
anon/authenticated roles. The two new duplicate triggers protect both import
creation and later operational load/invoice identifiers.

## 4. Finance Overview

All values come from scoped database queries, never sample constants:

- Recorded revenue: issued INVOICED/PAID operational load total rates, manual
  INCOME, confirmed imported income and signed income corrections.
- Recorded expenses: EXPENSE, DRIVER_PAY and their signed corrections.
- Net operating result: recorded revenue minus recorded expenses.
- Receipts: existing LoadPayment amounts, manual receipts, imported paid amounts
  and receipt corrections. Receipts do not add revenue.
- Current outstanding A/R: existing USD operational balances plus confirmed
  historical invoice balances across all dates; history without an invoice
  reference is excluded. Historical balances use recorded income minus receipts.
- Average revenue per linked load: linked income divided by distinct operational
  or historical load references with income in the selected period.
- Monthly chart: actual revenue and expense bars by record date, with a dollar
  axis and fixed height. An expandable accessible table includes exact revenue,
  expense and net amounts, including negative values.
- Four primary cards emphasize revenue, expenses, net and current outstanding.
  Receipts and average revenue per linked load remain in Additional insights;
  per-mile availability and calculation explanations use expandable details.
- The attention panel displays non-current aging buckets with recorded invoices.
  Recent activity loads the latest five period transactions independently, so a
  recent-activity failure does not hide successfully loaded overview totals.
- Per-mile values remain explicitly unavailable because the system lacks
  complete reliable mileage coverage. Recorded-load count is not a claim about
  operational completion status.

Calendar-date inputs and SQL grouping use UTC dates. The overview is an
operational record summary, not a complete accrual/cash accounting system.

## 5. Transactions

Manual income, expense, receipt and driver-pay entry supports bounded category,
description, date, exact USD amount, vendor/customer, notes and same-organization
load/driver/document associations. Driver pay requires a real driver for manual
entry. Common trucking categories are supplied; custom labels are retained on
records. Corrections append signed ADJUSTMENT entries with original reference,
retained effect/load/driver, reason, actor and timestamp. They never replace the
original amount. Posted records are paginated and sorted by date/amount with
date/type/category/search filters; API/URL filters additionally support source,
load, driver and import batch. Mutation keys reject conflicting retries.

## 6. Load Financials

Operational invoices and payments appear through the read projection. Live
load pages link to a financial detail page with agreed rate, linehaul, surcharge,
additional recorded income, recorded costs, estimated net and category totals.
It explicitly distinguishes agreed value before invoicing from recognized
overview revenue. Approved/billed charge opportunities are displayed for review
and are not automatically double-counted. Load-linked records trace back to the
operational load; historical records do not manufacture live loads/events.

## 7. Accounts Receivable

Existing A/R screens, partial/full payment logic, immutable payment ledger,
concurrency controls and invoice balances remain authoritative. Finance links
to that screen and consumes its balances. Finance adds combined operational/
historical aging (current, 1–30, 31–60, 61–90, 90+, missing due date). Unknown
historical payment status is warned about and conservatively remains outstanding
when an invoice reference exists. No new duplicate live invoice table was added.

## 8. Payments

Load-linked payment entry delegates to existing A/R with amount/date/idempotency.
The invoice generates its description/category; extra receipt associations or
notes are rejected rather than silently discarded. Existing A/R rejects
overpayment and repeat keys with different amounts. Unlinked manual payments
record receipts only. Historical PAID requires a payment date and records the
full imported gross as received; partial historical payments are not supported
by this first importer. Imported receipts can be corrected through explicit
adjustments. This does not connect banks or transmit money.

## 9. Historical Imports

CSV/XLSX upload, original SHA-256 retention, header detection, suggested/manual
mapping, validation, preview, explicit confirmation, import history, source
download and reversal are implemented. Limits: 5 MB, 1,000 rows, 40 columns,
one populated XLSX worksheet, 512 ZIP entries and 20 MB expanded content.
Formulas/cached formula cells, macros, external-link parts, embedded files and
XML entities are rejected. Dates, field lengths, money precision, required fields,
paid dates and surcharge-within-gross are checked. Warnings and skipped invalid/
duplicate rows require separate acknowledgment. Zero eligible rows cannot commit.

Duplicate prevention covers exact file checksum per organization, repeated
load/invoice references within the file, prior history and operational loads.
Confirmation rechecks current database state and revision inside the transaction.
Concurrent retries create history once. Gross includes fuel surcharge; separate
linehaul and surcharge entries sum to gross. Imported fuel affects expenses only.
Every imported financial entry retains batch, original row and source column;
the original file retains all unmapped cells. Preview changes never alter source
bytes. Reversal voids financial/history entries and preserves evidence/audit.
Reversal is blocked after subsequent corrections; identifiers stay reserved even
after reversal to prevent later accidental duplication.

## 10. Payroll Prep

Owner-only Payroll Prep selects a custom date period, lists recorded driver-pay
entries and corrections with driver/load/source, computes exact recorded pay
and exports CSV. Imported names remain source references rather than silently
linking accounts. This is recorded-pay preparation: settlement approval states,
pay-rule calculation, deductions, withholding, payroll transmission and payment
status are deferred. No existing approved settlement is changed.

## 11. Tax Center

Annual selection groups the same actual income/expense records and categories
and offers transaction CSV and source links. Category labels do not decide tax
deductibility. The UI states that it does not calculate or file taxes, provide
accounting advice or audited statements. Tax forms, 1099/IFTA preparation and
filing are outside this implementation.

## 12. Auditability

Transactions/corrections and upload/confirmation/reversal create finance audit
events atomically. The audit feed also includes existing invoice/billing/payment
load events and links to their source records. Entry details expose creator,
reason, source associations and original correction reference. Import detail
shows filename/checksum/row validation history and owner-authorized originals.
Financial audit events have no edit/delete API. The database amount trigger
provides an additional immutability layer for financial entries.

## 13. Reports / Exports

Implemented: monthly revenue/cost/net trend, category totals, current aging,
broker profitability (top 100 groups), single-load financial summary, selected
period driver pay, annual record summary, paginated audit/ledger, transaction CSV,
driver-pay CSV, fictional CSV import template and private original-file download.
Ledger export is limited to 10,000 records; payroll to 1,000 entries per period.
CSV text cells are protected against formula injection; validated signed decimal
amounts stay numeric. XLSX report export, PDF reports and specialized tax forms
are deferred. Per-truck profitability is not invented without a truck domain.

## 14. Security

Owner/Back Office finance access; Owner-only import mutations/original downloads
and payroll endpoint. Driver/Dispatcher access is denied server-side. Every
query carries organization scope; association foreign keys enforce matching
tenants. Existing sensitive driver-document authorization is preserved. Original
spreadsheet downloads require authentication and do not expose a permanent
storage URL. Private downloads/exports use no-store and originals use nosniff.
Spreadsheet parsing has bounded input/expansion and never evaluates formulas.
No finance contents or original file bodies are logged by the implementation.
No secrets, provider keys, production migrations or integrations were added.

## 15. UI

Routes: `/finance` with Overview/Transactions/Profitability/Payroll Prep/Tax
Center/Audit Trail, `/finance/imports`, `/finance/transactions/[id]`,
`/finance/loads/[id]`. Existing A/R remains linked. Header and route permissions
expose Finance only to authorized roles. Existing load pages link into Finance;
the Vault honors the selected supporting-document reference. Blue/white theme,
readable form text, empty/loading/error states, retry controls, accessible chart
values and explicit mutation confirmation are included.

The styling follow-up retains the app theme while using white bordered panels,
quiet underline navigation, a softly emphasized net card and blue/slate chart
series. Ledger amounts are right-aligned with tabular digits; source/type labels
are readable, and small screens retain date/source/link context within each row.
Period presets reflect the applied dates and preserve ledger filters when changed.
All existing reporting destinations remain directly accessible.

The Finance-500 follow-up added an explicit setup-required screen for environments
missing the schema. The API returns a safe `FINANCE_SETUP_REQUIRED` code with
HTTP 503; the UI hides unusable transaction/import/export actions, retains access
to existing A/R and supports checking again after setup. Other server failures
remain generic so internal SQL and connection details are not exposed.

## 16. Files Changed

This ticket's files (the repository also has substantial unrelated pre-existing
changes, which were preserved):

- `apps/api/prisma/schema.prisma`: new finance/import/history/audit schema.
- `apps/api/prisma/migrations/20260927170000_finance_foundation/migration.sql`:
  tables, constraints, view and financial immutability.
- `apps/api/prisma/migrations/20260927180000_finance_isolation/migration.sql`:
  RLS and duplicate guards.
- `apps/api/src/app.module.ts`: Finance module registration.
- `apps/api/src/finance/finance.module.ts`: module wiring.
- `apps/api/src/finance/finance.controller.ts`: authorized HTTP endpoints/downloads.
- `apps/api/src/finance/finance-database.filter.ts`: scoped missing-schema response.
- `apps/api/src/finance/finance-database.filter.spec.ts`: schema-error/privacy tests.
- `apps/api/src/finance/finance.dto.ts`: validated public inputs.
- `apps/api/src/finance/finance-domain.ts`: date/money/category/CSV rules.
- `apps/api/src/finance/finance.service.ts`: records, projections and reports.
- `apps/api/src/finance/finance-import.service.ts`: import lifecycle/provenance.
- `apps/api/src/finance/import-parser.ts`: bounded spreadsheet parsing/validation.
- `apps/api/src/finance/import-parser.spec.ts`: parser/domain/export regression.
- `apps/api/test/finance.database.cjs`: strict isolated-database launcher.
- `apps/api/test/finance.database.ts`: real HTTP/database integrity scenarios.
- `apps/api/test/auth.e2e-spec.ts`: missing-schema HTTP regression with auth/role checks.
- `apps/api/package.json`, `pnpm-lock.yaml`: justified parser dependencies.
- `packages/api-contracts/finance.d.ts`: shared response types.
- `apps/web/src/lib/api/finance.ts`: authenticated finance/download helpers.
- `apps/web/src/components/finance-ledger.tsx`: reusable ledger.
- `apps/web/src/components/finance-overview.tsx`: metric cards, attention buckets,
  recent activity, secondary insights and calculation context.
- `apps/web/src/components/finance-trend.tsx`: SVG/exact-value trend table.
- `apps/web/src/components/finance-transaction-form.tsx`: validated entry form.
- `apps/web/src/app/finance/page.tsx`: overview and report sections.
- `apps/web/src/app/finance/imports/page.tsx`: import wizard/history/reversal.
- `apps/web/src/app/finance/transactions/[id]/page.tsx`: source/correction detail.
- `apps/web/src/app/finance/loads/[id]/page.tsx`: load financial detail.
- `apps/web/src/components/app-header.tsx`: authorized Finance link.
- `apps/web/src/lib/auth/types.ts`: Finance route permissions.
- `apps/web/src/app/loads/[loadId]/page.tsx`: financial-detail link.
- `apps/web/src/app/documents/page.tsx`: supporting-document deep link.
- `apps/web/test/finance.spec.ts`: eight browser workflows, including setup
  recovery, mobile financial context and filter preservation.
- `scripts/release-gate.cjs`: opt-in finance HTTP/database gate.
- `scripts/finance-regression.ps1`: isolated quick/full runner with environment restoration.
- `docs/lp-fin-01-progress.md`: persistent checkpoint.
- `docs/lp-fin-01-test-runbook.md`: test database boundary, commands, operator demo.
- `docs/lp-fin-01-report.md`: this report.
- `docs/lp-fin-01-activation.md`: approved development/test migration and verification record.

Generated Prisma clients, build outputs, test logs and the local test cluster are
ignored artifacts, not application source additions. No commit/push was made.

## 17. Dependencies

Added API dependencies: csv-parse ^7.0.3 for robust quoted CSV, exceljs ^4.4.0 for
XLSX reading, yauzl ^3.4.0 for bounded ZIP preflight, and dev @types/yauzl ^3.4.0.
No chart library, accounting provider or unrelated framework upgrade was added.
No dependencies were intentionally removed.

## 18. Tests

Nine parser/domain cases cover mapping validation, quoted CSV, invalid/warning
classification, malformed/formula XLSX, real XLSX dates/decimals, file/header
limits, exact dates/money, formula injection and numeric signed CSV corrections.
Nineteen real HTTP/database scenarios cover auth/roles, invalid inputs, foreign
references, immutable/idempotent entries, exact totals, tenant detail/ledger,
database trigger, corrections, concurrent payments/overpayment, driver pay,
private original/hash duplicates, preview/revision/acknowledgment, concurrent
confirm, imported totals, provenance/filtering, live/history duplicate trigger,
load/profit/audit SQL, CSV safety and reversal/evidence retention.
Eight browser cases cover totals/chart/annual filter/empty ledger; entry and safe
errors; map/preview/explicit confirm; signed corrections; dispatcher exclusion;
setup-required display/recovery after enabling Finance; mobile signed amounts,
attention buckets, source links and layout; and retained preset filters plus
independent recent-activity failure handling.
Six database-filter unit cases cover missing-table errors in Prisma's ORM,
legacy raw-query and adapter-nested error shapes, plus preservation of existing
404/409/500 responses without private details. The authorization HTTP suite adds
an actual Nest request proving that unauthenticated/unauthorized callers are
rejected before a Finance query, while an authorized caller receives the safe
setup response and existing authentication continues to work.
Existing tests were not disabled or weakened.

## 19. Verification

**Initial full release gate:** 23 checks PASS, started `2026-09-27T22:56:23.272Z`, completed
`2026-09-27T22:59:18.401Z` (about 175 seconds). Exact artifacts:
`test-results/regression/2026-09-27T22-56-23-272Z/results.json` and `results.md`.

- Lint: API, web and mobile PASS.
- Typecheck: API, web and mobile PASS.
- API unit tests in full gate: 101 PASS / 14 suites.
- API HTTP tests: 218 PASS / 10 suites.
- Finance isolated HTTP/database checks: 19 scenarios PASS.
- Browser tests: 36 PASS, including all five Finance cases.
- Mobile tests: 16 PASS; source security and Expo compatibility PASS.
- Build: API and web production builds PASS; Android/iOS bundles PASS.
- Prisma validate/generate/migration status PASS on the separate test DB.
- Existing isolated stop-event/database integrity PASS.
- Secret audit self-tests and source/build audit PASS.
- `node --version`: v24.19.0.
- `pnpm exec node --version`: v24.19.0 (using the bundled Node path).

After the full gate, review found that signed CSV corrections should remain
numeric rather than apostrophe-prefixed text. A small fix and one regression
test were added. Final API typecheck, targeted finance lint, all 102 unit tests
in 14 suites, API build and all 19 isolated HTTP/database scenarios passed.
`scripts/finance-regression.ps1` was exercised successfully and restores the
caller environment. The unchanged web/mobile suites were not repeated.

**Activation/error-handling verification (before the styling follow-up):**

- Configured development/test migration deployment: both pending migrations PASS.
- Migration status: up to date.
- Existing business records: all 20 table fingerprints unchanged.
- Read-only owner-scoped queries in that database: overview, transactions, aging,
  profitability, payroll, audit, lookups, import history and load financial
  summary — all nine paths PASS.
- New Finance database-filter unit suite: 6 PASS.
- Authorization HTTP suite: 77 PASS, including the new missing-schema case.
- Finance browser suite: 6 PASS in the final run (22.1 seconds).
- API/web typechecks: PASS.
- Targeted API/web lint: PASS.
- API/web builds: PASS.
- `git diff --check`: PASS.

An initial browser attempt encountered Chrome ERR_NETWORK_IO_SUSPENDED before
Finance loaded. The suite passed on rerun without weakening assertions. The
cross-product 23-check gate was not repeated after the targeted activation fix;
the original full-gate counts above and these later targeted results are separate
runs, not a claimed new aggregate. No tests were rerun solely to update this report.

**Latest styling verification:**

- `pnpm --config.verify-deps-before-run=false --filter web typecheck`: PASS.
- `pnpm --config.verify-deps-before-run=false --filter web lint`: PASS.
- `pnpm --config.verify-deps-before-run=false --filter web exec playwright test test/finance.spec.ts`:
  8/8 PASS in 33.6 seconds against isolated local browser/API fixtures.
- `apps/web/test-results/.last-run.json`: passed, no failed tests.
- Desktop and 360px mobile screenshots reviewed. The mobile browser assertion
  confirms no horizontal page overflow; the chart remains at a fixed height.
- Two initial browser failures were outdated selectors for a collapsed details
  element and a card's accessible name. Selectors were corrected, assertions
  retained, and all eight cases passed on the final run.
- No API/database changes were made for styling. No new production build, native
  device run or complete cross-product release gate is claimed for this follow-up.

## 20. Manual Acceptance

Visually inspected the rendered Finance overview screenshot from browser tests:
text, amounts, chart and navigation are readable in the existing theme. Browser
interaction tests executed the actual web UI with deterministic finance API
fixtures; separate HTTP tests exercised real Nest/PostgreSQL paths. A human
Owner has not yet completed the business acceptance flow in a persistent
authenticated application environment. Do not claim production or live-provider
manual acceptance. The runbook supplies the exact next steps.

Following activation, Finance service reads were verified against the actual
configured development/test database using an existing active Owner. The user
has not yet confirmed the complete browser business-acceptance sequence there.
Next: refresh Finance and run the import, duplicate protection, correction,
payment and export checklist with fictional test records.

## 21. Deferred Items

- **Next Finance acceptance:** an authenticated Owner should review the actual
  development/test page and complete import, duplicate protection, correction,
  payment and export acceptance using fictional records, per the runbook.
- **Further Finance UX:** invoice-level filtered drilldowns, validated prior-period
  comparisons and daily/weekly chart aggregation. Current metric links open the
  complete period ledger; the A/R action opens the existing receivables page.
- **Post-Hackathon:** recurring expenses, editable category administration,
  settlements/approval lifecycle, partial historical receipts, resolving reserved
  reversed identifiers, persistent import-to-driver matching, reliable mileage/
  truck records, per-truck reports, richer filter pickers, large asynchronous
  imports, more report formats, and broader historical reconciliation.
- **Future Accounting Integrations:** QuickBooks, Xero, journal/sync adapters,
  formal cash/accrual reporting and reconciliation rules.
- **Future Payroll Integrations:** provider adapters, withholding, deductions,
  approval/payment execution and finalized settlement artifacts.
- **Future Tax Features:** professional-reviewed tax classifications, forms,
  1099/IFTA preparation and filing.
- **Future Banking/Reconciliation:** bank feeds, bank transactions, payment
  matching and reconciliation. No provider work began.

## 22. Known Risks

- The original missing-schema blocker is resolved in the configured
  development/test database following explicit user authorization. Other
  environments still need the reviewed migrations; missing tables now produce
  FINANCE_SETUP_REQUIRED rather than a generic temporary failure. The isolated
  regression cluster does not retain real authenticated demo accounts.
- Profitability reflects recorded costs only; incomplete expenses are not
  estimated, and overhead is not automatically allocated. Broker groups are
  capped at 100; selectors/history show the latest/first 100 candidates.
- USD-only finance and UTC reporting are explicit. Historical payment status
  supports full paid/unpaid/unknown, not partial allocation. Names/trucks are
  source references; missing invoice references are excluded from historical A/R.
- Reversed historical identifiers remain reserved. Imports with later corrections
  cannot be reversed automatically. No silent destructive recovery is provided.
- Spreadsheet parsing is bounded but runs in the API process. Background jobs,
  malware scanning and operational retention policies are not implemented.
- Native devices, RevenueCat sandbox and real invitation/email acceptance remain
  the pre-existing external acceptance items; this ticket did not complete them.
- The separately reported newly generated Broker share-link failure remains
  unresolved in the progress checkpoint. The failing link/origin and a live
  reproduction still need investigation; Finance work did not establish a fix.
- The repository retains substantial pre-existing uncommitted work. This report
  does not imply a reviewed commit, deployed release, or clean working tree.

## 23. Hackathon Demo

Follow `docs/lp-fin-01-test-runbook.md`, "Operator acceptance and demo": use the
now-migrated development/test application with an authorized Owner and fictional
demo organization, upload the supplied CSV,
review mapping/warnings, confirm, verify September totals (3,450.00 income,
987.44 cost, 2,462.56 net, 3,450.00 receipts), inspect source evidence, re-upload
to prove duplicate protection, add/correct an expense, export payroll and annual
records, trace a live invoice/partial payment, check organization separation,
then demonstrate a documented import reversal. No production integration is
required, and no sample values are shipped as actual organization metrics.

READY_FOR_FINANCE_ACCEPTANCE: YES

## Finance styling follow-up — September 27, 2026

Implemented the user-approved styling direction in the existing Finance page.
The four primary cards now link to period records or Accounts Receivable;
the net card uses a soft blue emphasis. Secondary metrics and calculation notes
remain available below. The fixed-height revenue/expense chart uses blue/slate
bars, a dollar axis, signed values and an expandable exact-value table including
net. The overview adds actual API aging buckets needing attention and the latest
five transactions for the selected period, with an independent failure state.

Ledger amounts are right-aligned with tabular digits. Sources and types have
readable labels; narrower layouts keep source, date and load/driver context in
the record column. Finance navigation uses quiet underlines; import, export,
manual entry, payroll, profitability, tax and audit remain available. Date preset
labels match the selected period and preset changes retain ledger filters while
resetting pagination.

Maintain this styling for subsequent Finance work: existing blue primary actions,
white panels, subtle slate borders, rounded-xl corners, slate secondary text,
visible focus indicators, consistent spacing and restrained color emphasis.
The existing shared application header and theme remain the reference.

Validation: full web lint and typecheck PASS; Finance browser suite 8/8 PASS
against local API fixtures. Desktop and 360px mobile screenshots reviewed;
mobile overflow, signed figures, source links, preset filters, setup recovery,
safe errors, import confirmation, correction and dispatcher denial covered.
Screenshots: apps/web/test-results/finance-overview.png and finance-mobile.png.
No full release gate was repeated for this UI follow-up.

No database, API authorization or financial calculation changes. Metric links
open the complete period ledger so adjustments and driver pay are not omitted
by a transaction-type-only filter. The receivables action opens the existing
Accounts Receivable page; invoice-level filtered drilldowns and prior-period
comparisons are not added in this styling increment. User visual acceptance in
the configured development/test app remains the next step.
