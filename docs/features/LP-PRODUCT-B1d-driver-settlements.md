# LP-PRODUCT-B1d — Driver settlements and payment preparation

Completed October 30, 2026 (America/Chicago). **RESULT: PASS for the authorized local implementation and isolated-test acceptance gate.** B1d-R explicitly approved the earlier four-table proposal. No production migration, deployment, customer-data access, paid provider, dependency upgrade, commit or push occurred. B2 was not started.

## Schema and migration

Migration: `apps/api/prisma/migrations/20261029120000_driver_settlements/migration.sql`.

Implemented only the approved four tables: `driver_settlements`, `driver_settlement_work`, `driver_settlement_items`, and `driver_settlement_payments`. Every row contains organization ownership. Tenant-safe composite foreign keys bind Drivers, actors, loads, completion events, original settlements and statement versions. Adjustments retain the original Driver/currency/period. No existing enum values, financial records or historical invoice documents were rewritten.

Supporting changes: LoadEvent composite unique index; active-work, per-load-item and flat-item uniqueness; state/amount/method checks; deferred item-total and work-eligibility checks; overlap, approval, immutable item/work/payment and document protections; scoped FinancialAuditEvent command-key index and protections; Finance view expense branch. New financial-table access is revoked from PUBLIC and existing anon/authenticated provider roles.

Before execution, the launcher verified PostgreSQL host `127.0.0.1`, port `55439`, database `loadpacket_finance_verified_test`, and data directory `C:/Users/User/Documents/loadpacket/test-results/finance-postgres`. All 19 previous migration checksums matched. SQL was inspected and successfully exercised in a rolled-back transaction before the sole pending migration was applied. All 20 checksums were verified again by the acceptance harness. Prisma client 7.10.0 was regenerated locally.

An explicit isolated Prisma config was used; `apps/api/.env` was never the target. No other database was substituted. Migration identity/checksum evidence is in ignored `test-results/settlements/migration-identity.json`.

Rollback after approvals/payments must retain the additive tables, documents and history and use a forward fix. Do not run an old writer that bypasses settlement/legacy-pay guards, remove obligations from Finance totals, or drop financial evidence to reverse this feature.

## Implemented settlement lifecycle

OWNER and BACK_OFFICE can prepare, edit, review, approve, cancel before approval, record payments and review history. DRIVER and DISPATCHER are denied. Existing Owner-only Payroll Prep/export authorization remains unchanged.

Persisted states: DRAFT → REVIEWED → APPROVED, plus pre-approval CANCELLED. Edits increment revision and clear review. Approval requires the exact reviewed revision and revalidated source work. Cancellation requires a reason and releases reservations while retaining outgoing work/item/audit history. Approved/cancelled headers cannot be edited or deleted.

Payment status is derived: NOT_APPROVED / UNPAID / PARTIALLY_PAID / PAID / CLOSED_BY_ADJUSTMENT. Draft amounts are previews, not recognized obligations. Status describes recorded evidence, not bank execution.

Approved corrections create separately reviewed signed adjustment statements. Original headers, PDFs, itemization, checksums and payments remain unchanged. No adjustment chains or new base-work reservations on adjustment statements. Negative adjustments cannot lower the effective obligation below recorded payments. Positive adjustments can reopen an outstanding balance on a previously paid original.

## Compensation and eligibility rules

Explicit per-load pay OR one flat amount for selected completed work, plus reviewed bonuses/deductions. Adjustment statements contain signed adjustment items only. All arithmetic uses Prisma Decimal; browser previews use integer cents via BigInt. USD only, at most two decimals, Decimal(12,2) bounds, positive normal items and nonzero adjustment totals. Original net must be positive. No percentage/mileage calculations, currency conversion or inference from carrier revenue.

Net = gross + bonuses - deductions + signed adjustments. Period dates are inclusive America/Chicago calendar dates; stored audit instants are UTC and payment dates are date-only.

Eligibility requires a same-tenant USD load in a completed execution state, exactly one completed assignment belonging to the selected Driver, and one matching LOAD_COMPLETED event whose assignment and completion time agree. Driver identity is never inferred from the event actor. Snapshot source load/Driver/assignment/completion references at preparation and revalidate before review/approval. Ambiguous, cancelled, incomplete and out-of-period work is rejected. Inactive Drivers can receive payment for verified historical work.

An active/approved work reservation is unique per organization/load. Only one non-cancelled base settlement may overlap a Driver's period; cancellation releases draft reservations, while approved reservations remain permanent. Additional compensation for an approved period uses an adjustment. Choose the intended completed-work set before approving a base statement; this release does not introduce multiple base settlements or team-driver allocation for the same period/work.

## Finance and legacy compatibility

Approved original and adjustment net amounts each appear once in `finance_records` as a Driver Settlement expense, on the approval calendar date. Stable `settlement:` identities support Finance detail/export and navigation to private statements. Payments are projected separately in settlement payable/payment history and never become a second expense or carrier receipt. Outstanding payable = original net + approved adjustments - recorded payments.

Existing carrier invoice revenue, receipts, historical manual/import rows and legacy DRIVER_PAY/correction chains are unchanged. Historical Payroll Prep totals/export remain unchanged and Owner-only; UI labels distinguish legacy unallocated recorded pay from settlement obligations/payments. Settlement expenses remain at Driver/period level; no arbitrary allocation of flat pay/bonuses/deductions into carrier revenue or individual-load profitability is invented.

Preparation and approval reject unresolved legacy Driver pay linked to selected loads or overlapping Driver periods. Unattributed legacy/imported pay is treated conservatively as ambiguous. Manual/import posting uses the existing organization Finance lock and rejects overlap with settlement-managed work/periods; attributable manual pay also locks Driver then load. Import validation occurs at posting, not just preview. No automatic adoption, reclassification or assumption of bank payment.

Legacy reconciliation remains a separate workflow: conflicting work is intentionally blocked rather than guessed into a settlement.

## Statement immutability and security

Approval generates a new private PDF using existing Document(type OTHER), DocumentVersion, checksum and DocumentStorage infrastructure. Statements include the reviewed sender/Driver snapshot, period, itemization, totals and source-work references. Actor/time/revision are preserved in the header and versioned audit journal.

The approved statement is never placed in carrier invoice packets or generic Driver/company vault collections. Generic vault and legacy metadata/extraction access reject settlement statements; authorized OWNER/BACK_OFFICE requests use the dedicated settlement endpoint. Downloads verify the stored checksum and return private/no-store PDF responses. No permanent public URLs are exposed.

Database triggers protect approved header/item/work and referenced document/version evidence from update/delete. Storage/PDF failures cannot publish an approved statement. Failed commands remove only confirmed uncommitted artifacts after checking the database; uncertain database/storage outcomes retain private artifacts for reconciliation rather than risking committed evidence.

PDF rendering uses the existing built-in font approach. Unsupported characters produce a clear validation error before approval; the original draft remains editable.

## Payment recording and idempotency

Manual partial/final payments require approved original identity, positive USD amount, date, supported method, reference except CASH, revision and UUID idempotency key. Methods: CASH, CHECK, ACH, WIRE, OTHER. OTHER requires a descriptive reference. Payments cannot exceed the combined remaining payable and cannot be edited/deleted. This feature neither initiates nor verifies transfers; refunds, wage recovery and payment reversals are excluded.

A settlement-specific FinancialAuditEvent key is unique within the tenant. Canonical request hashes include actor, action, target and payload. Exact retries return the original bounded command receipt; conflicting reuse rejects. GET detail returns current complete history. The journal stores versioned before/after snapshots independently of the bounded receipt, avoiding recursively copying an ever-growing payment history into every command.

The UI preserves a request key through transport or subsequent refresh failure. Browser acceptance deliberately discarded a successful preparation response and retried the same action against the real API/database without duplicating the settlement.

## Concurrency results

Settlement mutations participate in the existing organization Finance advisory lock to coordinate legacy imports/manual posting, then lock Driver → original settlement → child settlement → selected loads in stable order. Database uniqueness, overlap, deferred totals and remaining-balance guards independently enforce invariants.

Real PostgreSQL acceptance passed three iterations each of concurrent preparation, concurrent review, concurrent approval, approval versus edit, approval versus cancellation, concurrent partial payments, and adjustment versus final payment. Each incompatible pair had one successful result. A further payment race bypassed service/advisory locks and proved the database guard itself rejected an overpayment. Cross-tenant payment attempts and mutation of approved work/documents/payments/audit records were rejected.

## Web UX

Open Finance → Driver Settlements (`/finance/settlements`). Implemented overview, Driver/period selection, completed-work selection, per-load/flat compensation, bonuses/deductions, exact gross/net preview, editing/review/approval, cancellation, private statement download, partial/final payment entry, adjustment history and remaining payable. Finance transaction detail links directly to the corresponding settlement.

Existing LoadPacket components/style are reused; no full visual redesign or mobile expansion. Loading, validation, stale revision, legacy conflicts and retry feedback are handled. Overview shows the latest 100 statements; candidate-work selection reports its 100-load limit. Individual statements retain complete payment/adjustment history. Browser acceptance at 390px verified no page-level horizontal overflow; the wide table scrolls within its container. Screenshot was inspected.

## Test results

- **38 unit tests passed:** 10 settlement compensation/date/boundary tests and 28 targeted B1a invoice/packet/B1b action-token tests.
- **29 existing targeted HTTP tests passed:** invoice terms, payments and product-sprint contracts.
- **10 settlement isolated database/HTTP groups passed:** identity/checksums; role/tenant/DTO and exact retry; review invalidation/PDF/checksum/immutability; partial/final payments/inactive Driver; adjustments and Finance; repeated races; cancellation/history/eligibility; database-only payment race; legacy manual/import/payroll/export compatibility; provider access/audit immutability.
- **B1a isolated DB:** 8 groups passed, including unchanged issued PDFs/checksums, terms, A/R and concurrent generation.
- **B1b isolated DB/HTTP:** 13 groups passed, including stale assignment actions and four transition-race families.
- **B1c isolated DB:** 10 groups passed, including invoice allocations, receipts, supplementary invoices and concurrency.
- **4 distinct browser tests passed:** B1a, B1b, B1c and real settlement preparation-to-payment/adjustment. Settlement test reran successfully after adding lost-response recovery and final command receipts.
- API and web typechecks passed. Changed-area API/web lint passed. `git diff --check` and explicit whitespace validation of all task files passed. No full monorepo regression ran.

An initial unit invocation referenced the wrong token-test path; the correct existing path passed. The first browser run used an unsuitable exact label selector for a select; the accessible combobox selector passed. No test assertions were disabled. Existing pnpm symlink sandbox restrictions required approved validation outside the restricted filesystem sandbox; no dependencies or versions were changed.

## Files changed

22 maintained files, plus ignored generated client/test evidence:

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20261029120000_driver_settlements/migration.sql`
- `apps/api/src/finance/settlements-domain.ts`
- `apps/api/src/finance/settlements-domain.spec.ts`
- `apps/api/src/finance/settlements.dto.ts`
- `apps/api/src/finance/settlements.service.ts`
- `apps/api/src/finance/settlements.controller.ts`
- `apps/api/src/finance/finance.module.ts`
- `apps/api/src/finance/finance.service.ts`
- `apps/api/src/finance/finance-import.service.ts`
- `apps/api/src/documents/vault.service.ts`
- `apps/api/src/documents/documents.service.ts`
- `apps/api/test/settlements.database.cjs`
- `apps/api/test/settlements.database.ts`
- `packages/api-contracts/settlements.ts`
- `apps/web/src/app/finance/settlements/page.tsx`
- `apps/web/src/app/finance/page.tsx`
- `apps/web/src/app/finance/transactions/[id]/page.tsx`
- `apps/web/src/components/finance-ledger.tsx`
- `apps/web/playwright.settlements.config.ts`
- `apps/web/test/settlements.spec.ts`
- `docs/features/LP-PRODUCT-B1d-driver-settlements.md`

## Repeatable targeted validation

With only the explicitly verified isolated PostgreSQL instance running, set `DATABASE_URL=postgresql://postgres@127.0.0.1:55439/loadpacket_finance_verified_test` and `RUN_SETTLEMENT_TESTS=1`, then run `node test/settlements.database.cjs` from `apps/api`. Its launcher changes to the ignored evidence directory before importing PrismaService, preventing discovery of application `.env`; the test verifies identity and all migration checksums before writing fictional data.

Run `node node_modules/@playwright/test/cli.js test test/settlements.spec.ts --config playwright.settlements.config.ts` from `apps/web` using Node 24. The config starts local fictional auth/API/web services, sets the isolated database explicitly, and refuses to reuse existing servers. Existing B1a–B1c browser files may be included in the same targeted run.

Do not rerun the one-time ignored migration launcher after migration application. For future schema work, review a new migration and reverify the target/checksums; never reset this database or substitute the configured application database.

## Cleanup, remaining blockers and next action

No remaining blocker within the approved bounded local B1d-R scope. Legacy conflicts, unsupported PDF font characters and out-of-scope payment reversals have explicit failure paths and remain limitations rather than fabricated completion.

The isolated PostgreSQL instance started by this task was stopped; `pg_ctl status` confirmed no server running. Playwright-owned local test servers stopped with the runner. Fictional approved financial records and immutable PDFs remain in the isolated database/ignored `test-results/settlements/` as evidence. Existing unrelated workspace changes were preserved.

Next action: review this implementation/report. Enabling it in any other application database requires separate migration authorization and release work. No automatic B2 work or deployment follows this ticket.
