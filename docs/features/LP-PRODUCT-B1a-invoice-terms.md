# LP-PRODUCT-B1a — Tenant-correct invoices and payment terms

Date: October 21, 2026. **Result: PASS. Migration required: NO.**

## Changed behavior

New invoice PDFs use the authenticated load owner's organization, selected on the server after the tenant-scoped load lookup. The client can supply only optional payment terms, never a sender or organization identity. Legal company name is mandatory; missing/blank names produce an actionable Company Settings error before evidence is created. Existing optional DBA, address, contact, MC and USDOT fields appear on a carrier-details page. No demo/global carrier name is used.

The PDF, checksummed DocumentVersion and INVOICE_CREATED event capture the effective sender and policy. Existing load fields store the invoice timestamp, selected terms and due date atomically with the document/event. No schema addition is needed. Existing invoice retries return the issued evidence; a conflicting requested term change is rejected. Four concurrent requests produced exactly one invoice and invoice-created event, with no orphan synthetic files; losing concurrent attempts return a conflict/validation response and can safely refresh/retry.

Billing submission reuses frozen terms/dates instead of changing the PDF's agreement. Company edits affect new invoices only. Existing PDFs, versions, checksums, rates, payments and balances are not rewritten. Legacy invoices with stored terms and due dates retain them; an unsubmitted legacy invoice lacking a complete terms/date pair can still finish the existing billing workflow without regenerating its PDF. Existing due dates are retained. This ticket does not retrofit old PDFs or implement invoice corrections.

## Policy decisions

- At **new invoice generation**: explicit validated terms → agreed load terms → saved company default → 30 days if all are absent. Invalid supplied/stored settings cause validation errors, not silent fallback. Zero is a value, not absence.
- Company settings, generation and submission consistently accept integer **0–365**. Negative, fractional, null and string terms are rejected at mutation boundaries. An omitted generation value uses server-side precedence.
- **Zero means due on the invoice date.** This is an explicit invoice-date policy, supported by the existing integer/date fields and organization constraint. It does not assert that the customer received an email or document on that date. A contractual deadline measured from actual recipient receipt is outside this implementation; there is no verified receipt timestamp to use.
- Preserve the existing **America/Chicago billing calendar**, independently of the organization's operational timezone setting. The invoice retains its actual issue timestamp; the date printed and used as the start date is its Chicago calendar date. Add calendar days, including across DST/leap years. Store the due date at noon UTC as a date carrier, which remains on the intended Chicago date in both DST regimes; it is not an hour-of-day payment cutoff.
- A/R aging now compares Chicago calendar dates: due today remains due today until the next business-calendar date. This changes the derived aging display, not stored historical dates or monetary balances.
- After issue, selecting a different term is a conflict, not an invoice update. Any later correction needs a separately scoped evidence-preserving workflow.

## Web changes

Back Office shows the server's effective terms, supports an optional 0–365 override **before** invoice generation, and leaves the request empty when the user chooses the default. Issued terms and due date are displayed and locked. Company setup/API validation errors remain visible. Company Settings explains zero-day terms, precedence, immutable issued evidence and the fixed billing calendar. Existing components/layout/theme are retained.

## Targeted validation

- **20/20 unit tests:** shared precedence/fallback, zero and 0/1/120/121/365 boundaries, invalid values across all three DTOs, Chicago midnight, spring/fall DST, year/leap-day arithmetic, A/R day-boundary aging, existing billing-packet evidence guard.
- **90 HTTP tests passed** across the selected invoice, company, billing/payment and authorization scenarios. 68 unrelated cases were not selected by the explicit name filter; no tests were disabled. New endpoint tests include forbidden sender/organization fields, wrong role/tenant, accepted zero/121/365 terms, invalid inputs and conflicting post-issue overrides.
- **8 real PostgreSQL acceptance groups passed**, plus fixture cleanup: A/B identity separation and optional details; foreign-load denial; organization/agreed/override terms; PDF/packet/A/R agreement; post-issue conflict; profile changes and historical checksum preservation; four-way generation concurrency; missing-name setup failure. Only the existing isolated `127.0.0.1:55439/loadpacket_finance_verified_test` database was used. Random fictional tenants were removed and verified absent. No migrations ran.
- **3/3 Playwright tests passed:** new invoice terms/setup-error/zero/frozen-state flow, existing company edit/refresh, existing partial/final payment retry behavior. Local fictional API fixtures only.
- API and web typechecks: **PASS**. Targeted lint on changed API/web files: **PASS**. `git diff --check`: **PASS**. Restricted-shell dependency resolution initially failed; approved normal-access runs passed without dependency changes. One new test lint assertion was corrected and rechecked.
- Generated synthetic carrier A/B invoices were rendered for visual review: sender, terms, due dates and carrier-details layout are readable. The packet's embedded invoice text matches the original. Ignored PDF/PNG/results evidence: `test-results/invoice-terms/`.

Repeatable focused commands (Node 24, installed repository dependencies):

```powershell
# apps/api
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/loads/invoice-terms.spec.ts src/loads/billing-packet.spec.ts
node --experimental-vm-modules node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand --runTestsByPath test/invoice-terms.e2e-spec.ts test/payments.e2e-spec.ts test/company-drivers.e2e-spec.ts test/auth.e2e-spec.ts --testNamePattern 'Tenant invoice|company|invoice|billing|payment|receivable'
# Only with the existing isolated test cluster running; never substitute another DB:
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55439/loadpacket_finance_verified_test'
$env:RUN_INVOICE_DATABASE_TESTS='1'
node test/invoice-terms.database.cjs
# apps/web
node node_modules/@playwright/test/cli.js test invoice-terms.spec.ts payments.spec.ts management.spec.ts --grep 'billing terms|partial payments|owner edits company'
```

The database launcher checks the fixed target before importing services and changes to the ignored evidence directory to avoid application `.env` discovery. It never initializes/resets/migrates a database. Test storage is in memory; only synthetic evidence is written to the ignored directory.

## Files changed

API:
- `apps/api/src/loads/carrier-invoice.service.ts`
- `apps/api/src/loads/billing-submission.service.ts`
- `apps/api/src/loads/payment-readiness.service.ts`
- `apps/api/src/loads/payment-readiness.controller.ts`
- `apps/api/src/loads/accounts-receivable.service.ts`
- `apps/api/src/loads/submit-billing.dto.ts`
- `apps/api/src/loads/generate-invoice.dto.ts` (new)
- `apps/api/src/loads/invoice-terms.ts` (new)
- `apps/api/src/loads/invoice-terms.spec.ts` (new)
- `apps/api/test/invoice-terms.e2e-spec.ts` (new)
- `apps/api/test/invoice-terms.database.ts` (new)
- `apps/api/test/invoice-terms.database.cjs` (new)

Web:
- `apps/web/src/app/back-office/page.tsx`
- `apps/web/src/app/settings/company/page.tsx`
- `apps/web/test/invoice-terms.spec.ts` (new)

Documentation: this report. Company DTO/schema/contracts already support 0–365 and needed no changes. No dependencies, lockfile, mobile code or unrelated product features were changed by this task.

## Remaining limits and handoff

No B1a blocker remains. The existing PDF font cannot encode every writing system; unsupported company characters now produce a clear validation error rather than corrupted sender evidence. Optional contact fields remain optional; this is not a claim of jurisdiction-specific invoice compliance. Invoice adjustments, actual email/receipt tracking and organization-specific billing timezones are outside B1a.

The task-started isolated PostgreSQL server was stopped after fixture cleanup. Browser fixture servers exited after tests. No production/provider access, cloud resources, paid services, commit/push, full regression or migration occurred. Next: review this change and the synthetic invoices. **B1b has not started.**
