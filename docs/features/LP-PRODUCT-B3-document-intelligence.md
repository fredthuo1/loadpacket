# LP-PRODUCT-B3 — Document Intelligence and OCR

Date: 2026-10-30. Result: **PASS for local B3 acceptance**. No production activation or external AI provider is enabled.

## Implemented workflow

The existing RateCon parser is reused through `RateConDraftService.parseExtraction`; it was not replaced with a model. Upload accepts signature-validated PDF, PNG and JPEG. Originals remain private, immutable and checksummed. PDF text is extracted first; pages with fewer than 40 alphanumeric text characters use local OCR. PNG/JPEG use local OCR directly. Mixed PDFs preserve each page's method. Classification remains a Rate Confirmation candidate or UNKNOWN, requiring human verification.

The existing review page now shows an authenticated original preview, field snippets/pages, missing/conflicting values, editable fields and paperwork, payment terms, currency and an explicit verification checkbox. Source suggestions and operational defaults are distinguished. Loading, processing/preview failures, retry and submission errors are visible. Accessible labels, desktop and 390-pixel mobile-width behavior are tested; existing styling is retained.

Load creation requires current tenant/role authorization, explicit review and validated inputs. Source/run locks serialize confirmation: an identical replay returns the same load; conflicting replay or a changed source version fails. Older clients cannot bypass review after a processing record exists. Unprocessed legacy intake remains supported. No load or financial approval is created automatically from OCR.

## Confidence, provenance and money

Each field has a value/null, uncertainty (UNVERIFIED, MISSING, CONFLICT or DERIVED), bounded source snippets/page/method and validation warnings. These are not calibrated accuracy scores. Missing currency, broker, load number and amount stay missing. Defaults are identified as defaults. Derived totals retain component evidence. Conflicting labeled identity, currency, amounts and payment terms require correction.

Money remains decimal strings, with Decimal validation. Negative/unsupported formatting, malformed grouping, excess precision and conflicting amounts are flagged. Explicit zero remains zero. Terms follow B1a's 0–365-day policy; due on receipt is zero, and blank defers to existing load/company/invoice precedence. Only USD loads are supported by the existing product. Other detected currencies are visible and cannot be submitted as supported currencies or silently converted. Appointment/date text remains source text without invented timezone conversion.

Confirmation atomically stores the accepted inputs, reviewer/time, request key/hash, source version/checksum and confirmed/corrected values. Original files, successful extraction, attempt history and completed review remain immutable. Existing B1 financial evidence is preserved.

## OCR and optional AI

Pinned additions: `tesseract.js@7.0.0` and `@tesseract.js-data/eng@1.0.0`. Existing `pdf-parse@2.4.5` supplies text/rendering. English language data/WASM are local; the optional Tesseract installation script is disabled. Processing requires no native executable or CDN language download. See [Tesseract local installation documentation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md).

`RateConProcessor` is the adapter boundary. External AI is explicitly DISABLED and token reservation/usage is zero. No active AI provider adapter or external transmission is included. A future separately authorized adapter must add tenant policy, strict output validation, token/cost reservations and deadlines before activation. Document text is inert data and cannot execute instructions, choose permissions or approve money.

Actual OCR acceptance covers clear synthetic PNG, JPEG, scanned PDF and mixed two-page PDF (one text page, one OCR page). Rotated, poor-quality, handwritten and non-English accuracy is not qualified. An early mixed-PDF attempt timed out safely at 120 seconds; an isolated diagnostic and subsequent complete runs succeeded. This demonstrates safe fallback, not an availability or accuracy SLA.

## Security, limits and recovery

- 10 MB upload; 10 PDF pages; 20 megapixels and 10,000 pixels per image/render dimension; 100,000 extracted characters; 1 MB worker output. Spoofed/unsupported files and oversized dimensions fail safely.
- A disposable Node child uses a 256 MB JavaScript heap limit, no inherited application/database secrets, suppressed decoder stderr and a 120-second parent deadline. An independent child deadline bounds an orphan if the API exits. The heap setting is not an OS-enforced native/WASM RSS limit.
- Database-serialized admission permits two active leases globally and one per organization. A conservative ten-page reservation per attempt and 100-attempt rolling daily tenant allowance include failed/interrupted work. Retry accounting may conservatively retain older attempts.
- At most two attempts per source/pipeline; the second is explicit. Successful persisted results are reused without processing. Pipeline identity includes versions and policy.
- Tenant-local checksum deduplication serializes upload creation. This uses content-derived idempotency instead of the initially proposed uploadKey reuse. No cross-tenant cache reuse occurs.
- Each attempt has a 150-second lease. Expired work records interruption; explicit retry gets a new token. Locked completion checks reject superseded workers. Recovery is request-driven, not a background queue.
- Owner/Dispatcher preview authorization, private/no-store responses and revocable browser Blob URLs preserve private access. No permanent public storage URL is introduced.
- Child output/browser responses are validated; public failures are sanitized. Legacy extraction endpoint aliases use the same bounded service.

## Schema and migration

**Required: YES, implemented as one additive DocumentProcessingRun table plus reciprocal relations.** No existing business columns or enums were changed by B3.

The initial task stopped at the schema gate. The user's subsequent “Finish B3” continuation was treated as approval of the reported minimal schema and isolated-test implementation. Migration `20261030160000_document_processing` was reviewed, exercised with rollback, then applied only to verified local PostgreSQL 17.4:

- Host 127.0.0.1, port 55439, database `loadpacket_finance_verified_test`.
- Data directory `C:/Users/User/Documents/loadpacket/test-results/finance-postgres`.
- All 21 preceding migration checksums preserved; all 22 verified afterward. Prisma client regenerated.
- Explicit test configuration supplied the target, never `apps/api/.env`. No reset, backfill or production migration.

Composite tenant/source/requester/reviewer/load foreign keys, unique source/pipeline identity, state/size checks and immutable-evidence triggers protect persistence. Applied SQL was not edited afterward.

## Tests and evidence

- **19 focused unit tests passed:** existing parser/storage compensation, signatures/dimensions, missing/conflicting fields, monetary precision/formatting, zero/boundary terms, provenance/derived evidence, inert prompt-like text, defaults and confirmation hash.
- **110 compatibility HTTP tests passed:** auth, B1a invoice terms and B2 invitations. No full regression.
- **11 isolated database acceptance groups passed, 39 HTTP requests:** real OCR formats and mixed-page routing; aliases/cache; preview/role/tenant access; invalid/oversized uploads; retries/manual fallback; explicit concurrent confirmation; checksum/review immutability; superseded worker rejection; per-tenant admission; restart cache; expired lease; stale source; composite tenant FK; daily allowance.
- Timing/recovery tests use a controlled processor with real PostgreSQL, locks, storage and services. OCR format tests use the real worker. Database HTTP authentication uses synthetic tokens only.
- **Browser acceptance passed:** real API/database/OCR with the existing local Supabase network-boundary fixture; signup/onboarding, scanned upload, source evidence/preview, strict response validation, unconfirmed-submission rejection, corrections, zero terms and load creation. Final extension covers desktop/mobile overflow and adding/removing paperwork.
- API/web typechecks and changed-area lint passed with no warnings. Final incremental checks passed after financial-formatting and browser assertions were added. `git diff --check` passed (Git emitted only existing line-ending/environment notices).

Maintained commands, using Node 24 and installed locked dependencies:

1. Start and explicitly verify only the isolated database identified above.
2. In `apps/api`, set `RUN_INTELLIGENCE_TESTS=1` and `DATABASE_URL` to that isolated target; run `node test/document-intelligence.database.cjs`. This generates synthetic browser fixtures.
3. In `apps/web`, run `node node_modules/@playwright/test/cli.js test --config playwright.intelligence.config.ts`. Ports 3100/3104/3105 must be unused; existing services are not reused.
4. Stop the isolated test database afterward. Do not rerun earlier migration launchers that expect fewer migrations.

Ignored evidence: `test-results/document-intelligence/results.json`, `fixtures/`, `browser/`, migration rollback artifacts and `test-results/access/identity.json`. Synthetic immutable evidence is retained. Node/pg deprecation notices are not application failures; no dependency upgrade was performed to suppress them.

## B3 files changed

- Persistence/dependencies: `apps/api/prisma/schema.prisma`, migration `20261030160000_document_processing/migration.sql`, `apps/api/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`.
- Under `apps/api/src/documents`: new `document-intelligence.service.ts`, `document-intelligence.controller.ts`, `document-intelligence.spec.ts`, `ratecon-file.ts`, `ratecon-worker.ts`, `ratecon-processor.ts`, `ratecon-evidence.ts`; updated `documents.service.ts`, `documents.service.spec.ts`, `documents.controller.ts`, `documents.module.ts`, `ratecon-draft.service.ts`.
- Load confirmation: `apps/api/src/loads/create-load.dto.ts`, `loads.service.ts`.
- Contracts: `packages/api-contracts/document-intelligence.ts`, `ratecon.d.ts`.
- Web: `apps/web/src/app/loads/new/ratecon-upload.tsx`, `review/[documentId]/page.tsx`, `apps/web/src/components/intake-evidence.tsx`, `apps/web/src/lib/api/ratecon-draft.ts`.
- Tests: `apps/api/test/document-intelligence.database.cjs`, `.ts`, `test/support/database-fixture.ts`; `apps/web/playwright.intelligence.config.ts`, `apps/web/test/intelligence.spec.ts`.
- This report. Generated Prisma output and synthetic evidence remain ignored. Large pre-existing workspace changes are preserved and are not a B3-only diff.

## Remaining limits and next action

No local B3 implementation blocker remains after final verification. Production activation/migration, external AI and OCR accuracy across arbitrary broker layouts are outside the demonstrated scope. Mandatory human verification remains essential. Review this report before selecting the next product batch. B4 has not begun; no customer data, paid services, deployment, commit or push was used.

Cleanup: all 22 migration checksums reverified; the isolated PostgreSQL cluster stopped successfully. No listeners remain on test ports 3100, 3104, 3105 or 55439. Browser acceptance's final result is passed. Generated client and synthetic test evidence are ignored and retained locally; no unrelated process or data was removed.
