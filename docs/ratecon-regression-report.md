# Rate Confirmation regression — BRF-94726

Status: COMPLETE — original PDF workflow passes; all 22 full release gate checks pass.
Verified September 27, 2026; gate completed at 14:56:22 UTC.

## Root causes confirmed before implementation

- Review UI asserted a nonexistent nested `result.load.loadNumber.value` model.
  The successful API response already exposes `loadNumber` at the top level.
  Its catch displayed the resulting raw JavaScript exception.
- The actual PDF text joins both stop headings as `PICKUP - STOP 1 DELIVERY - STOP 2`.
  Exact section-heading matching failed, then both stops fell back to searching
  the entire document and selected the first generic appointment.
- Facility names are unlabeled; the old parser required a Facility label.
- Street and city/state/ZIP occupy separate lines; the old address matcher
  required a single line.
- Equipment and Commodity share a line; the old field match consumed the remainder.
- Stop date text was not represented in the draft or copied into the existing
  appointment field during creation.

## Implementation and security scope

The existing flat API response is canonical. Shared types and runtime boundary
validation replace the invented nested web model. The existing `draft` alias
remains compatible but the web does not consume it. Optional stop `date` is
additive; the web joins source date and appointment into the existing creation
appointment field without inferring a timezone or changing the database schema.

Parsing uses stop headings, postal address structure, and labeled reference
boundaries. Missing/ambiguous stops require manual review rather than borrowing
the other stop's fields. Equipment stops at adjacent Commodity/Weight/Pieces labels.
Longer Facility Name and Appointment Time labels take precedence over their prefixes.

Authentication, tenant predicates, immutable document handling, Decimal financial
logic, Broker sharing, storage architecture and hosting are unchanged. Browser
tests override identity/database/files only within a localhost test application.

## Final checkpoint

- API, web and mobile typechecks passed on the final implementation.
- API and web lint passed.
- Five parser regression tests passed.
- Four browser regression tests passed, including original PDF upload, real PDF
  extraction, editable review, confirmation, POST load and GET created load.
- Full release gate passed all 22 checks in approximately 155 seconds.
- Next action: resume LP-PROD-01 when requested; no RateCon regression blocker remains.

No production deployment, operational load creation, reset, migration change,
dependency upgrade, commit or LP-PROD-01 implementation performed.

## Files changed for this fix

- `apps/api/src/documents/ratecon-draft.service.ts`: shared response annotation,
  structural stop parsing, multiline addresses, facility inference, date preservation,
  equipment boundary and specific-label precedence.
- `packages/api-contracts/ratecon.d.ts`: canonical flat response/draft/stop/requirement types.
- `apps/web/src/lib/api/ratecon-draft.ts`: validate unknown JSON at the client boundary;
  join source date and time for the existing creation payload.
- `apps/web/src/app/loads/new/review/[documentId]/page.tsx`: consume flat fields,
  display warnings, retain manual review/retry, use actual requirement fields,
  avoid invented per-field confidence, show actionable draft/create failures.
- `apps/api/src/documents/ratecon-draft.spec.ts`: five parser regression cases.
- `apps/api/test/fixtures/ratecon-brf-94726.pdf`: unchanged original sample PDF.
- `apps/api/test/fixtures/ratecon-brf-94726.json`: actual extracted text for fast unit tests.
- `apps/api/test/fixtures/ratecon-brf-94726.md`: provenance, checksum and test instructions.
- `apps/api/test/ratecon-browser-fixture.ts`: real Nest/PDF/load workflow with isolated boundaries.
- `apps/api/test/ratecon-browser-fixture.cjs`: existing ts-node startup preserving Nest
  decorator metadata and resolving generated Prisma TypeScript imports.
- `apps/api/test/support/database-fixture.ts`: optional spy factory lets browser tests
  reuse the existing query-aware database without Jest globals; Jest remains the default.
- `apps/web/playwright.config.ts`: start the isolated API alongside existing browser fixtures.
- `apps/web/test/ratecon.spec.ts`: successful real-PDF pipeline plus three malformed-response
  UI cases, required-parent validation assertions, review screenshot and result attachment.
- `docs/ratecon-regression-report.md`: checkpoint and final evidence.

## Canonical contract

Top-level `documentId`, `loadNumber`, `brokerName`, `brokerContact`, `equipment`,
`currency`, `linehaul`, `fuelSurcharge`, `totalRate`, `pickup`, `delivery`,
`requirements`, `extraction`, `reviewRequired`, and `warnings`. Money remains
decimal strings. Stops retain nullable facility/appointment/reference, address
text, and additive optional date text. Each requirement retains `type`,
`documentType`, `requirement`, `confidence`. The existing `draft` compatibility
alias remains; it is not a second web interpretation. No `load`, `data`, or
`entities` wrapper is expected. No load-creation DTO or migration changed.

## Actual original-PDF extraction verified in the browser test

```json
{
  "loadNumber": "BRF-94726",
  "brokerName": "BlueRiver Freight Brokerage LLC",
  "brokerContact": "Melissa Grant",
  "equipment": "53 ft Dry Van",
  "currency": "USD",
  "linehaul": "3250.00",
  "fuelSurcharge": "200.00",
  "totalRate": "3450.00",
  "pickup": {
    "facilityName": "Midwest Food Products Distribution Center",
    "address": "2400 Enterprise Ave, St. Louis, MO 63147",
    "date": "September 28, 2026",
    "appointment": "8:00 AM CDT",
    "referenceNumber": "PU-882451"
  },
  "delivery": {
    "facilityName": "Lone Star Retail Distribution Center",
    "address": "8800 Logistics Pkwy, Dallas, TX 75241",
    "date": "September 29, 2026",
    "appointment": "2:00 PM CDT",
    "referenceNumber": "DEL-663921"
  },
  "requirements": [
    { "type": "BOL", "documentType": "BOL", "requirement": "REQUIRED", "confidence": 0.98 },
    { "type": "POD", "documentType": "POD", "requirement": "REQUIRED", "confidence": 0.98 },
    { "type": "CARRIER_INVOICE", "documentType": "CARRIER_INVOICE", "requirement": "REQUIRED", "confidence": 0.98 }
  ],
  "warnings": []
}
```

## Load creation verification

Original PDF upload → HTTP 201 draft → editable review → Confirm & Create Load
→ HTTP 201 load → load detail route → HTTP 200 GET created load passed.
The created load retains both addresses, equipment and all three money values;
pickup `appointmentText` is `September 28, 2026 8:00 AM CDT`, delivery is
`September 29, 2026 2:00 PM CDT`. Decimal serialization on GET may omit trailing
zeroes; assertions verify the same exact monetary values without floating-point
arithmetic. This exercises real controllers/services and pdf-parse with the
existing query-aware in-memory DB and private memory storage, not a production
database or provider identity account.

## Tests added

Parser tests cover all requested original-PDF fields and requirements; legacy
labeled single-line addresses; numbered headings with different fixture values;
combined headings without a delivery reference; and a delivery reference without
an address that must not borrow pickup data.

Browser tests cover the complete successful original PDF flow and three malformed
responses: null, alias-only, and loadNumber-only. They verify actionable text,
retained Try another RateCon link, absence of raw JS exceptions and absence of
the create button on failure. The success case also validates rejection of
otherwise valid drafts missing loadNumber/pickup/delivery/extraction/requirements.

## Regressions and remaining scope

Legacy single-section labeled parsing is explicitly tested. Ambiguous combined
layouts now leave stop details empty for manual correction instead of recycling
the other stop's appointment. This is intentional. No supplied fixture values
are hardcoded in production parsing.

No unresolved issue identified in the supplied PDF workflow. Production deployment
and live production persistence were not performed; browser verification uses
isolated test boundaries. Existing external mobile/store/invitation acceptance
remains outside this targeted fix.

## Exact verification commands and results

Runtime: Node 24.19.0. In PowerShell the bundled Node path was prepended:

```powershell
$env:PATH='C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;'+$env:PATH
$env:RUN_MOBILE_DATABASE_TESTS='1'
node scripts/release-gate.cjs --scope=full
```

PASS: 22/22 checks. Recorded commands below all passed; these are the package
equivalents of root lint/typecheck/test/build, executed by the existing gate.

```text
node scripts/mobile-audit.cjs
pnpm --config.verify-deps-before-run=false --filter mobile typecheck
pnpm --config.verify-deps-before-run=false --filter mobile lint
pnpm --config.verify-deps-before-run=false --filter mobile test
pnpm --config.verify-deps-before-run=false --filter mobile exec expo install --check
pnpm --config.verify-deps-before-run=false --filter mobile export
pnpm --config.verify-deps-before-run=false --filter api exec prisma validate
pnpm --config.verify-deps-before-run=false --filter api exec prisma generate
pnpm --config.verify-deps-before-run=false --filter api exec prisma migrate status
pnpm --config.verify-deps-before-run=false --filter api typecheck
pnpm --config.verify-deps-before-run=false --filter api lint
pnpm --config.verify-deps-before-run=false --filter api build
pnpm --config.verify-deps-before-run=false --filter api test --runInBand
pnpm --config.verify-deps-before-run=false --filter api test:e2e --runInBand
pnpm --config.verify-deps-before-run=false --filter web typecheck
pnpm --config.verify-deps-before-run=false --filter web lint
pnpm --config.verify-deps-before-run=false --filter web build
pnpm --config.verify-deps-before-run=false --filter web test:e2e
pnpm --config.verify-deps-before-run=false --filter mobile exec expo config --type public
pnpm --config.verify-deps-before-run=false --filter api exec tsx test/stop-events.database.ts
node --test scripts/product-secret-audit.test.cjs
node scripts/product-secret-audit.cjs
```

Totals: API unit 93/93 (13 suites); API HTTP 218/218 (10 suites); web browser
30/30; mobile 16/16; secret-audit self-tests 6/6. Native Android/iOS bundle
exports pass. Fourteen migrations are present and the database schema is current.
Existing isolated DB integrity, ordering, row-lock concurrency, event uniqueness,
detention and broker regeneration checks pass.

Targeted final development runs also passed:

```text
pnpm --config.verify-deps-before-run=false --filter api test --runInBand ratecon-draft.spec.ts
pnpm --config.verify-deps-before-run=false --filter web exec playwright test test/ratecon.spec.ts
```

These ran five parser tests and four browser tests respectively. Initial development
failures identified the Facility Name prefix collision and test-harness startup,
multipart forwarding, and locator issues; all were corrected before the full gate.
No tests were disabled. The full gate was run once after targeted checks passed.

Evidence: `test-results/regression/2026-09-27T14-53-47-801Z/results.json` and
adjacent per-check logs. Browser review screenshot:
`apps/web/test-results/ratecon-real-sample-PDF-up-69605--confirm-→-created-load-GET/review.png`.
The screenshot was visually inspected: both facilities, addresses, dates/times,
equipment, rates and required paperwork are legible and correctly populated.

READY_TO_RESUME_LP_PROD_01: YES
