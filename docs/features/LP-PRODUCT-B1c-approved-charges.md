# LP-PRODUCT-B1c — Approved charges and supplemental invoices

Completed October 23, 2026. **RESULT: PASS for the authorized local implementation and isolated-test gate.** No production migration, deployment, customer-data access, commit or push. B1d was not started.

## Migration and schema

Applied only `20261022120000_carrier_invoice_charges` to PostgreSQL at **127.0.0.1:55439/loadpacket_finance_verified_test**, data directory `C:/Users/User/Documents/loadpacket/test-results/finance-postgres`.

The SQL was created and inspected before execution. The guard verified host, port, database, data directory, all 18 preceding migration checksums and exactly one pending migration. An explicit isolated Prisma configuration was used; `apps/api/.env` was not the migration target. Post-application verification checked all 19 migration checksums and four protection triggers. Prisma schema validation and client generation 7.10.0 passed. Existing migrations were not edited.

Approved additions only:

- `CarrierInvoice`: tenant/load ownership; original/supplement relationship; number, issue timestamp, frozen terms/due date/currency/Decimal amount; exact document-version reference; versioned sender/recipient/itemization snapshot; creator, idempotency key/request hash; first-submission timestamp.
- `CarrierInvoiceCharge`: immutable charge allocation with approved amount/currency/description, approval evidence and available source document-version/checksum snapshot.
- Nullable `LoadPayment.invoiceId`, with a same-tenant/same-load composite foreign key. Historical receipts remain unchanged.
- Supporting tenant/load foreign keys, unique invoice numbers/request keys/document versions, one-original-per-load partial unique index, permanent one-allocation-per-charge uniqueness, checks and indexes. No additional tables, columns or enums outside the approved proposal.
- Protection triggers reject invoice rewrites/deletes, allocation rewrites/deletes and billed-opportunity changes. Only the first submission update is allowed. Allocation insertion checks approved state, amount and currency.
- `finance_records` replaces only current-load revenue recognition: submitted canonical invoices once, legacy load revenue only without a canonical original. Existing manual/import and payment branches remain. `CREATE OR REPLACE VIEW` preserves ownership/grants; provider-role access restrictions are retained.

Evidence: ignored `test-results/invoice-charges/migration-identity.json` and `migration-verified.json`.

## Implemented charge flow

Detected → reviewed amount → APPROVED → explicitly selected in a reviewed invoice → BILLED with immutable allocation. Approval does not create a receivable or receipt. Submission creates recognized invoice revenue/A/R; it does not send email.

OWNER/BACK_OFFICE authorization is enforced by the existing controller guards. Every lookup/reference is tenant-scoped. Charge review, approval, issuance, submission and payment use the load-first lock convention. Invoice commands validate a preview token, selected charge identities and a request key. Identical actor/key/payload retries replay the same issued result; conflicting retries or stale previews fail clearly.

Only positive approved unbilled charges in the load currency can be included. Unapproved, dismissed, zero-valued, foreign and already-billed selections are rejected. Original linehaul/fuel/base values are unchanged. Where base components are incomplete, the invoice explicitly labels the remaining base rate; inconsistent or oversized totals are rejected. All financial arithmetic uses Decimal.

Scans no longer delete duplicate receipt opportunities or their events. Existing duplicate evidence is retained. Billed amount changes, dismissal, deletion and rebilling are rejected; no credit/refund or negative supplemental workflow was introduced.

## Original and supplemental invoices

New original invoices contain itemized base components and explicitly selected approved charges. Each issue freezes company identity, recipient, terms, dates, currency, total and itemization in the canonical record and immutable PDF. B1a's organization validation, 0–365 payment terms, precedence and America/Chicago calendar rules remain.

A positive supplement receives its own number, PDF/version/checksum, terms and due date, and references the original. It does not replace the original accepted invoice requirement or change the original PDF, rate confirmation, receipt history or paid timestamp. Supplemental billing works for unpaid, partially paid and fully paid originals. The original must be submitted before supplemental submission.

Packets select an exact canonical invoice version, show its face amount and include its immutable itemization. The original packet endpoint remains available. Additional packet selection uses `?invoiceId=<id>`.

## Payments, A/R and Finance

- New invoice-aware payments include `invoiceId`. The compatibility payment endpoint without it targets only the original invoice.
- Historical null-invoice receipts remain attributed exclusively to the original; adoption never backfills/reassigns them. Retry comparison rejects reuse against another invoice.
- Each invoice has its own submitted principal, received amount, remaining balance and payment limit. Supplemental receipts do not alter the original load's payment fields. Invoice-specific paid dates are derived from the relevant receipts.
- A/R includes submitted supplements even when the original load is PAID. The invoice panel shows aggregate submitted outstanding for the load. Finance aging reads the same A/R projection.
- Finance recognizes submitted canonical amounts once and payments separately as PAYMENT. Per-load totals and invoice ledger detail support canonical records. No duplicate FinancialTransaction INCOME entries are posted for invoices.
- Existing linked manual INCOME is a conservative reconciliation blocker before charge billing. New manual INCOME on canonical-invoice loads is rejected to prevent duplicate recognition; use reviewed charges instead. Unrelated manual/import accounting remains intact.

## Legacy compatibility

Legacy invoices keep the existing read path until adoption is needed. Adoption requires one unambiguous known B1a issue event/document/version, matching invoice number, timestamp, amount, currency, sender evidence, frozen terms/due date and accepted requirement. Stored bytes must match the version checksum. Submission evidence and receipt sums/currencies/audit references must reconcile. Legacy BILLED charges without allocation and incomplete/ambiguous history block adoption with a reconciliation error.

Successful adoption inserts canonical references/snapshots only. Historical PDFs, checksums, original load identity, receipts and null receipt invoice references are not modified. Old receipt retries remain idempotent after adoption.

## Web behavior

Existing styling/components are retained. The shared Charges and invoices panel is available on load detail, Back Office and Finance load detail. It shows proposed/approved/billed charges, reviewed selection, original/supplement references, immutable totals, received/remaining amounts, packet download, explicit supplemental submission and payment links. Errors, stale reviews, refresh and exact retry handling are visible. A/R sends the selected invoice identity when recording payment. Finance reloads its summary after invoice actions.

## Verification

- **28 unit tests passed:** B1a terms/calendar/packet evidence and B1b command/token tests.
- **29 HTTP tests passed:** invoice terms/issuance, invoice preview/submission authorization, forbidden/invalid input, payment and charge-review contracts. Existing tenant/role checks remain.
- **10 B1c real PostgreSQL acceptance groups passed:** approved-only itemization; PDF/packet/A/R agreement; partial/fully paid supplements; payment limits/retries; Finance view/detail parity; immutable invoice/allocation/opportunity evidence; same-tenant wrong-load and cross-tenant reference rejection; stale/ambiguous/manual-income blockers; exact legacy adoption; permanent allocation uniqueness; duplicate receipt scan history/source snapshots.
- **Concurrency:** three PostgreSQL iterations each of approval vs issuance, two original issuers, two supplemental issuers selecting the same charge, and payment vs supplemental issuance. At most one allocation/initial invoice survives. Exact lost-response replay and conflicting-key rejection also have an unconditional dedicated check. A duplicate-receipt scan ran concurrently with issuance and again after billing; both opportunities/events and the billed version reference remained.
- **8 B1a database groups passed:** distinct tenant identity, defaults/overrides/zero, date/PDF/packet/A/R parity, historical checksum/profile-change protection, four-way invoice idempotency and missing-company validation.
- **13 B1b database/HTTP groups passed:** load transitions, financial freezes, stale assignment protection and the existing four concurrency races.
- **3 browser journeys passed across targeted runs:** B1c approval → itemized original → supplement → submission → invoice payment; B1a terms; B1b corrections/unassignment/stale conflict/cancellation. B1c uses controlled fictional HTTP responses for UI acceptance. B1b uses the real Nest fixture with memory persistence. Database race claims come from PostgreSQL, not browser mocks.
- API/web typechecks and changed-area lint passed. Updated fixture mocks and the new panel effect were corrected before final checks. One B1b browser run refreshed too early to be stale; the test now holds the last real management snapshot during that scenario, then releases it to verify recovery. Its rejection/recovery assertions remain and the rerun passed.
- Prisma validation, migration checksum/protection verification, CJS syntax and whitespace checks completed. No full monorepo regression.

The previous session's final lint/typecheck calls were not executed when automatic approval review ran out of workspace credits. The same approval process succeeded on resume; those checks subsequently passed.

## Files changed by B1c-R

Schema and migration:

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20261022120000_carrier_invoice_charges/migration.sql`

API implementation:

- `apps/api/src/loads/carrier-invoice.service.ts`
- `apps/api/src/loads/generate-invoice.dto.ts`
- `apps/api/src/loads/accounts-receivable.service.ts`
- `apps/api/src/loads/record-payment.dto.ts`
- `apps/api/src/loads/billing-submission.service.ts`
- `apps/api/src/loads/billing-packet.service.ts`
- `apps/api/src/loads/payment-readiness.controller.ts`
- `apps/api/src/loads/load-management.service.ts`
- `apps/api/src/money-opportunities/money-opportunities.service.ts`
- `apps/api/src/finance/finance.service.ts`

API tests:

- `apps/api/test/invoice-charges.database.cjs`
- `apps/api/test/invoice-charges.database.ts`
- `apps/api/test/invoice-terms.database.ts`
- `apps/api/test/invoice-terms.e2e-spec.ts`
- `apps/api/test/support/database-fixture.ts`
- `apps/api/src/loads/invoice-terms.spec.ts`
- `apps/api/src/loads/billing-packet.spec.ts`

Web and browser tests:

- `apps/web/src/components/invoice-charges.tsx`
- `apps/web/src/app/back-office/page.tsx`
- `apps/web/src/app/back-office/accounts-receivable/page.tsx`
- `apps/web/src/app/finance/loads/[id]/page.tsx`
- `apps/web/src/app/loads/[loadId]/page.tsx`
- `apps/web/test/invoice-charges.spec.ts`
- `apps/web/test/load-corrections.spec.ts`

Report: `docs/features/LP-PRODUCT-B1c-approved-charges.md`. **27 maintained files**; generated Prisma output and local evidence are ignored. Unrelated workspace changes were preserved.

## Cleanup, limits and next action

The task-started isolated PostgreSQL cluster was stopped; `pg_ctl status` confirmed no server running. Playwright stopped its fixture servers. Test schema and fictional immutable invoice/receipt records were intentionally retained; protections were not disabled for cleanup. B1c generated PDFs are under ignored `test-results/invoice-charges/evidence`; latest fixture IDs/checks are in `results.json`. B1a's retained fixture inventory/PDFs are under `test-results/invoice-terms/`. No customer data or paid services were used.

No B1c implementation blocker remains within the approved positive-invoice scope. Ambiguous legacy evidence, unexplained existing manual income and unsupported PDF characters produce validation/reconciliation errors. Credit/refund execution remains deliberately excluded. Submission is a recorded workflow action, not proof of email delivery or broker receipt.

No application/production database was migrated, so this feature must not be used against an unmigrated database. Any rollout needs separate authorization. After invoice evidence exists, rollback must preserve it: disable new writes and forward-fix with a compatible reader rather than dropping tables or running an old reader that ignores supplements.

Next action: review this implementation/report. No B1d, deployment, commit or push was started.
