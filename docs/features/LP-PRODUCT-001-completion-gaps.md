# LP-PRODUCT-001 — Product completion gaps

Assessment date: October 21, 2026. **Overall: PARTIAL — substantial working product, not product-complete across the requested areas.**

This is a repository-based assessment, not a new release certification. No application implementation, migration, provider access, deployment, paid resource, commit or push occurred. LP-PROD-001 through LP-PROD-003C were not re-audited. Existing workspace changes were preserved. The only deliverable is this document.

## 1. Product completion matrix

COMPLETE means the bounded behavior below exists and has relevant behavioral evidence, not just a route or unit test. PARTIAL means an important product path is absent. MISSING means no meaningful implementation of the named capability was found in the inspected product surfaces. UNVERIFIED means implementation exists but the necessary functional acceptance evidence is absent. An area can contain complete subfeatures without being complete overall.

| # | Product area | Classification | Implemented boundary / remaining gap | Evidence and follow-up |
|---|---|---|---|---|
| 1 | Organization onboarding and management | PARTIAL | Existing company profile is editable; no new-carrier/first-Owner onboarding journey. Saved company defaults do not fully drive billing. | Company service/UI, E1; G1, G4 |
| 2 | Authentication, roles and invitations | PARTIAL | Password sessions, role guards and Driver invitation/acceptance exist. No general staff invitations/role administration or self-service forgotten-password journey. Real invitation delivery unverified. | Auth/Driver invitation services, E1; G2 |
| 3 | Driver management | COMPLETE | Roster, create/edit, active/inactive state, linked-account state and recent assignment history; guarded deactivation and assignment. General HR is outside this boundary. | Driver management service, management browser/HTTP and database evidence, E1 |
| 4 | Load creation, assignment and tracking | PARTIAL | Manual/reviewed intake, pre-start reassignment, execution, ordered stop events and timeline work. No ordinary post-create correction or explicit unassign/cancel journey. | Loads/Driver/stop services, E1–E3; G3 |
| 5 | Rate confirmation upload, extraction and review | COMPLETE | Supported text PDFs: actual upload, deterministic extraction, editable review, confirmation and created-load retrieval. This does not include scanned-PDF OCR/general AI. | Actual PDF browser fixture plus API parsing, E2; AI expansion in G7 |
| 6 | BOL, POD, invoices and document vault | PARTIAL | Evidence capture/versioning, optional signatures, review, vault and billing packet work. Invoice sender is global/demo configuration rather than the tenant profile. Approved extras have no invoice integration. | Document services, invoice service, E1/E3/E4; G4/G6 |
| 7 | Driver mobile workflows | UNVERIFIED | Online Driver flows are implemented and logic tested. Installed-device camera, location, SecureStore, signature WebView and interruption recovery lack acceptance evidence. | Mobile screens/services, E3–E5; G5 |
| 8 | Finance, settlements, payroll preparation and reporting | PARTIAL | Ledger, exact amounts, A/R, corrections, reporting, recorded-pay prep and tax-category summaries work. Driver settlement calculation/approval/statement lifecycle is missing. | Finance implementation and real DB/HTTP evidence, E3/E4; G6 |
| 9 | Spreadsheet imports and exports | COMPLETE | Bounded CSV/XLSX historical import, mapping, preview, explicit confirmation, deduplication, provenance, reversal and CSV exports. Not a general spreadsheet/accounting sync system. | Import parser/service, Finance browser and DB tests, E3/E4 |
| 10 | AI-assisted document processing | MISSING | PDF text parsing and heuristic suggestions exist; no general OCR/AI extraction adapter or persisted extraction-run/confidence review history was found. Do not market the parser as a general AI processor. | Extractor/draft service and schema/DTO inspection; G7 |
| 11 | Organization subscriptions and Driver Pro | PARTIAL | Personal Pro Load Finder exists; native/store purchase acceptance unverified. Organization subscription/entitlement/administration implementation is missing. | Subscription adapter/service/screens, E5; G8 |
| 12 | Notifications and activity history | PARTIAL | Load timelines, dashboard attention and Finance audit/activity exist. No user notification inbox/read state, preferences or general delivery workflow. | Load events, Owner dashboard, Finance audit; G9 |
| 13 | Settings and administration | PARTIAL | Company profile and Driver administration exist. No staff lifecycle, account settings/recovery or organization billing settings; payment-term validation is inconsistent. | Settings routes and company/auth/Finance code; G2/G4/G8/G10 |
| 14 | Responsive web and mobile UX | PARTIAL | Shared controls, responsive layouts, feedback and prior contrast/overflow coverage exist. Requested fonts/palette are not implemented; native accessibility/keyboard acceptance is unverified. | Theme/shared components, E4; G11 |

Counts: **3 COMPLETE, 9 PARTIAL, 1 MISSING, 1 UNVERIFIED**. These are area classifications, not a percentage of engineering effort. Completion of a bounded importer or parser does not imply every possible format is supported.

### Evidence reused and its limits

- **E1 — Day 7:** `docs/day7-production-foundation-report.md`, `docs/day7a-company-drivers.md`, API company/Driver/auth/invitation tests, `apps/web/test/management.spec.ts`, `invitations.spec.ts`, `auth.spec.ts`, and `apps/api/test/company-drivers.database.ts`. Company/roster behavior has browser + HTTP coverage and reported real database invariant checks. The golden HTTP workflow overrides identity, storage and Prisma with fixtures; its title saying “settles” means paying the carrier invoice, **not creating a Driver settlement**.
- **E2 — Intake and Days 8–13:** `docs/ratecon-regression-report.md`, `docs/day8-10-mobile-release-report.md`, `docs/day11-13-release-report.md`. `apps/web/test/ratecon.spec.ts` drives actual PDF parsing and Nest services through `apps/api/test/ratecon-browser-fixture.ts`, with in-memory persistence/storage and fictional identity. This is genuine parser/browser behavior, not real provider or database acceptance. Stop/detention/Broker concurrency has separate reported database checks.
- **E3 — Latest located full result:** `test-results/regression/2026-09-30T03-12-23-119Z/results.json`: **24/24 PASS**, 113 API unit tests, 219 HTTP tests, 43 browser tests, 30 mobile tests; signature/Finance/stop concurrency checks, builds, lint and typechecks also passed. Its Expo log says “Dependencies are up to date”; `test-results/ios-release-01/report.md` explicitly records online compatibility. This supersedes the September 29 compatibility failure in older reports. It is historical evidence, not a fresh full check of today's workspace, and predates the Test Store addition.
- **E4 — Feature acceptance:** `docs/lp-fin-01-report.md` records 19 isolated Finance DB/HTTP scenarios and later eight Finance browser cases; `docs/lp-doc-sign-01-report.md` records eight signature integrity scenario groups; `docs/lp-ui-polish-01-report.md` records responsive captures at 1440/820/390px and zero page-level overflow. Finance also has a 360px check. Browser fixtures, DB tests and device tests are different evidence levels. Owner business acceptance and physical signature acceptance remain open.
- **E5 — Current narrow verification:** on this assessment, Node 24.19.0 ran `node --import tsx --test test/mobile.test.ts` from `apps/mobile`: **33/33 PASS**, including imported signature tests and three development Test Store guard cases. First restricted-shell attempt failed before tests executed (`uv_os_get_passwd`); rerunning with approved shell access passed. No provider/database was used. These tests do not mount the full native UI or execute store transactions.
- **Sharing:** `docs/lp-submission-readiness.md` records a newly generated link working in a logged-out local browser against a fixture API. The original user's first-open failure was not reproduced in its original environment. Full browser reload loses the deliberately removed fragment; in-page Refresh retains the in-memory token. Neither an unresolved original report nor a local pass establishes a new production defect/fix.

Implementation checks below cover actual service logic, client call sites, contracts/schema and relevant tests. Broad negative findings are limited to the inspected web/mobile/API sources and shared contracts; they are not inferred from button names or TODOs. No environment file values were read.

## 2. Verified complete features to preserve

- **Driver administration:** `apps/api/src/drivers/driver-management.service.ts` scopes roster/detail/mutations to the organization, presents account linkage, and retains inactive history. Browser tests exercise create/edit/deactivate/reactivate and forbidden roles; API/database evidence covers active-assignment protection and concurrent assignment/deactivation. No need to rebuild this module.
- **Text-PDF intake:** `documents.service.ts` stores an immutable checksummed upload; `ratecon-text-extractor.service.ts` extracts readable PDF text; `ratecon-draft.service.ts` produces conservative structured suggestions/warnings; the web review confirms before `loads.service.ts` creates the load. The sample PDF test checks amounts, facilities, dates, references, requirements and created-load retrieval. Manual intake exists independently.
- **Document handling subfeatures:** BOL/POD/receipts, rejected-evidence replacement as a new version, version-bound human review, stale-review denial, private downloads, company/Driver vault contexts and optional signature evidence have relevant behavioral tests. Signature absence must continue to allow otherwise valid paperwork. Invoice content issues below do not mean the vault is missing.
- **Operational execution subfeatures:** assignment, accept/start/complete, ordered arrival/departure with optional foreground coordinates, manual location fallback, repeated-transition handling and safe Driver projections exist. Location evidence is discrete; continuous/background tracking is not part of this implementation.
- **Finance preparation and imports:** `apps/api/src/finance/{finance.service,finance-import.service,import-parser}.ts`, their browser/DB tests and `packages/api-contracts/finance.d.ts` support exact recorded revenue/cost/receipts, no double-counted payment revenue, append-only adjustments, historical provenance, duplicate prevention and original-file retention. Import limits are 5 MB, 1,000 rows, 40 columns and one populated XLSX sheet. CSV exports and payroll-prep records exist. These do not transmit payroll, execute payments or file taxes.
- **Readiness, A/R and history subfeatures:** evidence-based readiness, billing-state transition, partial/final recorded payments, repeat/conflict protection, remaining balances, load events and Finance audit views are implemented. Preserve their tenant checks, immutable evidence and Decimal rules.

## 3. Missing or incomplete user journeys

### G1 — A new carrier starts using LoadPacket (P1; batch B2)

**Missing behavior:** an unlinked signed-in Owner cannot create/join a carrier through the product. `AuthService.authenticate` requires an existing application User; `CompanyService` only reads/updates that user's existing organization. Company configuration is not organization onboarding.

**Smallest change:** add a deliberately bounded first-Owner provisioning/onboarding path and a setup checklist leading to company profile, Driver and first load. Choose controlled invitation-based carrier provisioning or self-service registration before implementation; do not require a public signup system merely to support an operator-provisioned pilot.

**Dependencies:** ownership policy, identity-provider callback behavior and tenant creation rules. **Targeted tests:** new verified identity creates exactly one organization/Owner under retries; forged organization/role fields rejected; existing unrelated accounts cannot claim another carrier; resume partial setup; first load without seed edits. No organization switching is implied.

### G2 — Add office staff and recover an account (P1; B2)

**Missing behavior:** Owner cannot invite/manage Dispatcher or Back Office accounts, change/revoke their access through settings, or use a general forgot-password flow. Existing Driver invite/recovery is specifically linked to Driver onboarding; `/auth/invite` requires a Driver mapping. Login alone does not provide general account recovery.

**Existing:** `auth/*`, `drivers/driver-invitation.service.ts`, Supabase identity adapter, web auth callback/invite pages, role-aware navigation. **Smallest change:** extend the existing identity adapter and guarded membership services with office invitations, role/deactivation controls and a separate safe account-recovery path. Preserve the last Owner and distinguish Driver status from staff access. Do not redesign authentication.

**Dependencies:** role matrix, last-Owner/ownership-transfer policy, provider redirects and authorized test email. **Tests:** role escalation/cross-tenant denial, duplicate invite/resend/expiry, last-Owner protection, revocation on next request, recovery token expiry and account isolation. Existing Driver email receipt/acceptance needs an actual controlled-provider test; missing SMTP configuration would be an external dependency, not missing invitation code.

### G3 — Correct or cancel a booked load (P1; B1)

**Missing behavior:** after confirmation there is no ordinary edit/cancel/unassign workflow. `loads.controller.ts` exposes create/manual/dashboard/assign/detail; `LoadsService.assignDriver` permits reassignment only while BOOKED. Existing assignment status enums do not establish a cancel UI/API. Current intake creates one pickup and one delivery; arbitrary multi-stop planning is an expansion, not a proven bug.

**Smallest change:** guarded pre-start corrections and explicit cancellation/unassignment with reason/history; define what to do with an accepted assignment and existing documents. Protect delivered/invoiced data rather than making a generic editable status endpoint. Search/filter/pagination for the Owner load list is a P2 usability extension; existing Loads navigation itself was fixed and tested.

**Dependencies:** allowed state-transition policy, Driver stale-screen behavior and source-document review rules. **Tests:** edit/accept/start races, duplicate cancellation, reassignment isolation, immutable source retention, invoiced-load rejection, stale Driver actions and dashboard/history consistency.

### G4 — Issue the correct carrier invoice and apply company settings (P0; B1 first slice)

**Observed implementation gap:** `apps/api/src/loads/carrier-invoice.service.ts:555` renders FROM using `process.env.DEV_CARRIER_NAME ?? 'LoadPacket Demo Carrier'`; the PDF input does not include the company profile. Different tenants can therefore receive the same global sender identity. This is a source finding, not a claim that customer invoices were inspected.

`billing-submission.service.ts:168` chooses request terms, then load terms, then 30; it does not read `Organization.defaultPaymentTermsDays`. Invoice date formatting uses fixed `America/Chicago`. Company accepts terms **0–365**, the public billing DTO accepts **1–120**, and service validation accepts **1–365**. A saved setting can be unusable or silently irrelevant.

**Smallest change:** source sender identity from the authorized company, snapshot the appropriate identity/terms into new invoice evidence, explicitly define term precedence and date/timezone behavior, and align UI/DTO/service validation. Preserve existing issued PDFs/checksums and old balances. Clarify whether 0 means due-on-receipt instead of coercing it. Reuse company contracts and the existing immutable invoice path.

**Dependencies:** agreed sender fields, term/date rules; no new provider needed. **Tests:** two carriers produce distinct correct sender details; profile changes affect new invoices only; company default, explicit override, boundary terms and timezone date cases; concurrent invoice generation remains safe; packet, due-date and A/R values agree. This is the recommended first implementation slice.

### G5 — Finish a real mobile load, including interruptions (P0 acceptance; B4)

**Unverified behavior:** installation → login/session restart → assignment → accept/start → stop events → photo/file BOL/POD → optional signature → completion has no located signed-build/device acceptance record. `apps/mobile/app/(driver)/loads/[loadId].tsx` and the auth/API/capture/location/signature services implement the flow; mocked tests and Hermes exports cannot verify native permissions or WebView drawing.

**Smallest next step:** execute the existing `docs/lp-ios-acceptance.md` and signature checklist with fictional data; fix only reproduced problems. Capture build/OS identity and pass/fail evidence. Check denied permissions, actual image formats, upload retry, force-close, account switching, keyboard and large text.

**Dependencies:** authorized reachable test API, valid native build/signing and physical iPhone; equivalent Android native acceptance if Android is included. EAS project binding and the four-package compatibility patch already have evidence—do not redo them reflexively. Current provider state is not asserted.

**Scope distinction:** failed uploads/signatures retain in-memory retry information only. Durable offline queuing/resume after restart is missing, but is P2 unless offline delivery is a product promise. Owner/Finance native screens and background tracking were intentionally excluded from the Driver app. Do not label those omissions regressions.

### G6 — Turn approved work into correct billing and Driver settlements (P1; B1)

**Missing behavior:** approving detention/other Money Found does not add it to an invoice or A/R. `carrier-invoice.service.ts` renders the load rate/components; opportunity approval is a separate workflow. An existing invoice cannot be silently rewritten to include extras.

Payroll Prep (`FinanceService.payroll`) sums recorded DRIVER_PAY and corrections and returns `RECORDED`. There is no settlement entity/approval/statement lifecycle in the inspected schema/services. A carrier invoice reaching PAID is not Driver settlement approval or payment. Historical partial receipt allocation and persistent imported-name-to-Driver reconciliation are also deferred.

**Smallest change:** define an explicit reviewed charge-to-invoice adjustment path and a bounded settlement draft → review → approve → immutable statement/recorded-payment flow, reusing ledger/Driver/load references. Start with explicit reviewed pay amounts; do not invent payroll withholding or bank payment execution. Add historical partial receipts and reviewed Driver matching only when required by the selected accounting workflow.

**Dependencies:** charge billing policy, pay basis, approval roles, corrections and period boundaries. **Tests:** decimal totals, approve/retry races, no double-counted charge or pay, cross-tenant associations, immutable approved statements, reversal/adjustment provenance, partial payment reconciliation and export parity. Complete the existing Owner Finance acceptance runbook using fictional records. Per-mile/per-truck profitability, tax filing, bank sync and accounting integrations remain P2 expansions requiring their own domain inputs.

### G7 — Process a scanned document and explain its suggestions (P1 provenance; P2 OCR/AI expansion; B3)

**Missing behavior:** image-only PDFs cannot produce a draft via the current text extractor; it throws “No readable text was found.” No image OCR/LLM integration was found in the document module. Requirement confidence values are parser heuristics. The draft response contains page/character counts, warnings and confidence, but the inspected creation DTO/persistence path does not retain a complete extraction run, parser/provider version, field confidence or reviewer changes. Original document bytes/checksums and reviewed load fields are retained.

**Smallest change:** retain version-bound extraction provenance and reviewed differences; make unsupported-scan/manual-entry guidance explicit. If general AI/OCR is included in the release scope, add one bounded adapter behind the existing review contract, with processing/error/retry states and manual fallback. Do not replace deterministic financial readiness or automatically approve extracted money.

**Dependencies:** supported document types, privacy/retention and cost policy, extraction accuracy corpus; provider configuration is external only after an adapter is implemented. **Tests:** text PDF non-regression, scanned/rotated/low-quality/empty/corrupt inputs, provider failure, low confidence, stale source version, reviewer correction persistence, cross-tenant denial and manual completion. Repository rules require stored confidence/processing metadata; response-only heuristics are insufficient provenance for expanded AI claims.

### G8 — Buy Driver Pro / manage a carrier subscription (P0 Pro acceptance; P2 organization billing decision; B4)

**Existing:** personal Pro Load Finder searches authorized assignments; prices come from offerings; purchase/cancel/restore, account identity changes and expiry/error locking are implemented. Free operational actions remain free. `subscriptions/native.ts` allows Test Store keys only through `__DEV__`; production validation rejects them. Current mocked tests pass. Older runbooks saying all Test Store keys are rejected are stale.

**Unverified:** actual installed native purchase, restore, expiry, revocation and cross-account receipt behavior. **Missing:** organization plan/entitlement ownership, checkout/manage/cancel, billing history and server enforcement. Driver Pro must not be treated as an organization subscription or reused to gate shared business data.

**Smallest change:** first accept the existing personal benefit with real store sandbox evidence and update its runbook. Separately decide whether carrier subscriptions are required for product-complete status; if yes, implement an organization-owned subscription lifecycle and authenticated settings, with a verified provider synchronization path. If not, explicitly declare the initial product provisioned/free for organizations. A webhook is not necessary merely for the current client-only Finder benefit; it becomes relevant to authoritative server-side paid capabilities.

**Dependencies/tests:** actual offering/product and restore policy, fictional accounts, signed native build. Test cancel/purchase/restore, original-user ownership, offline/expiry, late callbacks and uninterrupted Free workflow. For organizations, test duplicate/out-of-order provider events, subscription changes/cancellation, role/tenant isolation and grace-period rules. Test Store success alone does not establish App Store/Play acceptance.

### G9 — Learn that action is needed without reopening every screen (P1 inbox; P2 external delivery; B5)

**Missing behavior:** no general in-app notification inbox/read state or preferences for assignment, rejected paperwork, expiring documents or outstanding billing was found. Current attention panels and load/Finance history require visiting their screens. Supabase invitation email is a separate implemented capability. Billing submission stores state/recipient metadata; it does not send an invoice email.

**Smallest change:** build a scoped actionable in-app inbox from existing events/attention rules, with read state and authorized deep links; preserve existing timelines. Explicitly label manual billing submission as recorded submission. Add external email/push delivery and delivery/retry visibility only if selected as a product requirement.

**Dependencies:** event-to-recipient matrix, duplicate policy, notification preferences and authorization. **Tests:** correct role/tenant recipient, no sensitive content in previews, read state isolation, deduplicated event handling, stale-link access checks, loading/empty/error states; provider failure and retry tests only for selected delivery channels.

### G10 — Settings that actually control behavior (P1; B1/B2/B4)

The current web settings area is Company only; mobile Account exposes identity/session/Pro rather than a broad account editor. Staff administration/recovery is G2, billing settings G8 and company invoice/terms integration G4. **Smallest change:** add only those functional settings, with authorized server commands and success/error feedback; do not add nonfunctional settings toggles. Dependencies and targeted tests are those of the owning gaps. Organization switching, MFA/SSO and full HR remain separately scoped P2 decisions.

### G11 — Apply the selected brand consistently (P1; B6)

See section 4. This is a confirmed visual specification gap, not an infrastructure dependency. Native usability remains UNVERIFIED until device testing. No screen redesign is proposed here.

## 4. UX consistency gaps

The requested direction is authoritative: **Manrope headings, DM Sans body, navy #092731, dark ink #113640, teal #16756D, mint #96EAD2, light background #F2F7F7**. Red/green/amber indicate meaningful states, not decorative emphasis.

- **Tokens/fonts — confirmed gap:** web `globals.css` uses `#f8fafc`, `#0f172a`, blue focus and Arial/Helvetica. Its Geist variables are referenced but not established by `layout.tsx`; no Manrope/DM Sans loading was found. Native `src/components/ui.tsx` uses the same slate/blue family and no brand font family. `docs/ui-theme.md` documents that older direction. Smallest change: shared semantic color/type roles mapped into existing web/native controls, load the chosen fonts with safe fallback, update theme documentation. Do not create a large design system.
- **Components/forms — partial reuse:** `management-ui.tsx` and native `ui.tsx` centralize buttons, fields, cards and feedback, while many screens still use hard-coded utility colors. Preserve 44px web/50px native controls, visible focus, labels, loading guards and readable disabled text. Verify all default/hover/focus/disabled/error states after token changes; do not assume new colors automatically pass contrast.
- **Navigation — working baseline:** role filtering and active states exist; Loads is an intentional dashboard anchor with repeated-click/data-loading regression coverage. Do not create a new Loads route solely because there is no dedicated list page. Verify keyboard order, focus after navigation, small-width wrapping and new settings links when added. Long role navigation is a usability review item, not a demonstrated broken button.
- **Tables/Finance — preserve useful work:** responsive ledger columns reappear as record details at smaller widths; tables use internal scrolling. Charts have exact-value table alternatives. Retain four Finance cards and provenance links. Source inspection does not establish that every table, zoom level or long filename fits; prior screenshots cover selected states only.
- **Feedback/history — gaps:** manual-only recovery and recorded submission must be explicit; an action button must not imply an email/payment was sent. Broker full-reload behavior needs clear recovery guidance without persisting bearer tokens casually. Distinguish pending/unverified operations from success, preserve retry data appropriately, and keep notification work in B5.
- **Acceptance still needed:** representative 360/390/820/1440px states; keyboard-only navigation; 200% zoom/large text; contrast including status and disabled controls; screen-reader names/announcements; native safe areas, keyboard, permissions and signature pad. Existing web contrast/overflow tests prove their old theme scenarios only. No current screenshot or accessibility audit was performed in this assessment.

## 5. Billing and AI boundaries

Three different concepts must remain distinct: **carrier invoicing/A/R**, **Driver pay/settlements**, and **LoadPacket product subscriptions**. Current invoice payment tests prove the first; Payroll Prep does not complete the second; personal Finder does not implement organization billing.

Highest-risk product issue is tenant-correct invoice output and applied company terms (G4). Next are charge/settlement lifecycle completeness (G6), actual personal purchase acceptance and a carrier billing scope decision (G8). No amount of hosting configuration implements those missing product paths.

The current parser is useful and tested. It is neither general OCR nor calibrated AI. Add provenance and truthful limitations first; expand through a provider adapter only if required. Human confirmation, immutable originals and deterministic readiness remain mandatory. No paid AI service was contacted for this assessment.

## 6. Ordered implementation tickets

These are proposals for review, not authorization or work started. Six cohesive batches; each can be delivered in small reviewed slices. P0 blocks trustworthy core output or acceptance; P1 closes ordinary customer workflows; P2 is a scope-dependent expansion.

1. **B1 — Complete load-to-billing-to-settlement (P0/P1).** Start **B1a: tenant invoice identity + effective payment terms/date rules**, G4, **2–4 engineer-days**. Then guarded load corrections/cancellation, reviewed extra-charge billing and basic immutable settlements, G3/G6. Whole batch roughly **12–20 days**, highly dependent on pay/adjustment policy. Candidate files: company contracts/DTOs/settings, invoice/billing services, loads/finance services/controllers, their web forms and targeted tests; additive schema work only if separately approved. Acceptance: correct carrier/terms in new PDFs, protected history, an ordinary correction path and a reviewed settlement statement without duplicate financial effects.
2. **B2 — Carrier onboarding and access administration (P1).** G1/G2/G10, **5–8 days** for one selected onboarding model, staff invites/revocation and recovery. Reuse auth guards, Supabase adapter and management components. Acceptance: a new fictional carrier and office team can enter without direct database edits; forbidden membership claims and last-Owner removal fail; actual invitation/recovery receipt is evidenced when provider access is authorized.
3. **B3 — Reliable document assistance (P1/P2).** G7, **2–3 days** for provenance/manual-fallback clarity; an additional **4–7 days** for one selected OCR/AI integration and bounded corpus acceptance. Reuse document versions, extractor interface boundary, draft contract and review UI. Acceptance: source/version/method/confidence/review trace, useful failed-scan recovery, and no automatic financial decisions. General document AI remains MISSING if only provenance is selected.
4. **B4 — Driver mobile and paid-benefit acceptance (P0; organization billing P2).** G5/G8, **2–4 hands-on days** for existing Driver/Pro/device evidence and bounded fixes; provider/build queues excluded. Optional organization subscription implementation adds approximately **6–10 days** after plans/entitlement ownership are decided. Acceptance: installed core journey and real sandbox purchase/restore/account-isolation evidence; offline/restart limitations stated; carrier plan either implemented and tested or explicitly excluded from the first release. Reuse current subscription architecture; do not reopen the resolved Expo patch gate without new evidence.
5. **B5 — Actionable activity and notifications (P1/P2).** G9, **3–5 days** for scoped in-app inbox and truthful submission/history feedback; external channel integration adds **2–4 days per initially selected bounded channel**, subject to provider requirements. Acceptance: correct recipients, no cross-tenant content, useful deep links, read/dedup behavior and honest delivery states. Capture original-environment Broker first-open acceptance here when a test environment is authorized; fix only a reproduced defect.
6. **B6 — Brand consistency and responsive acceptance (P1).** G11, **4–6 days** across shared tokens/fonts and existing screens. Preserve layout, Finance design, navigation semantics and business handlers. Acceptance: requested palette/type, semantic status colors, no invisible text, focused web contrast/overflow/keyboard tests and native keyboard/large-text/signature checks. Refresh stale theme/runbook assertions as part of their owning batches.

**Recommended first batch:** B1a only, then review its invoice/PDF and term-boundary evidence before expanding B1. Mobile/provider acceptance can be prepared alongside subsequent approved work, but is not performed in this ticket.

## 7. Dependencies and effort qualifications

Estimates are engineering days for someone familiar with this codebase, including targeted tests, not promised elapsed time. They exclude external approval queues, store review and unbounded defect remediation. Do not sum optional OCR, carrier billing, external notification channels, offline queues or accounting integrations into an approved commitment. The first three scope decisions are onboarding model, basic settlement/pay rules, and whether general AI/organization subscriptions are mandatory at launch.

Product dependencies: B1a precedes billing/settlement acceptance; B2 supplies clean users/roles for later acceptance; B3 reuses existing evidence/review; B4 requires fictional assignments and accepted identities; B5 consumes committed events and existing permissions; B6 should begin with tokens and finish against settled workflows. Each batch needs its own API/UI/authorization/concurrency tests and focused lint/typecheck. A final regression belongs to a later release gate, not this assessment.

External functional dependencies are limited to authorized test identity/email, a reachable test API, device/signing, store/RevenueCat test configuration, and any future selected OCR/notification/billing provider. Missing external access yields UNVERIFIED acceptance, not MISSING code. Durable hosting/storage, database HA, regional failover and production operations are separate release dependencies and not re-assessed or counted as product features here.

Known intentional exclusions unless promoted: Owner-native Finance, continuous/background tracking, durable offline operation, arbitrary multi-stop planning, organization switching, SSO/MFA, advanced HR, payroll transmission/withholding, tax filing, bank feeds, QuickBooks/Xero/EDI, general accounting reconciliation and large asynchronous imports. USD-only recorded-finance preparation is the current boundary. A broader commercial promise requires a separate scope decision rather than relabeling these complete.

## 8. Acceptance criteria for product-complete status

1. Agree a launch scope for all 14 areas. Every in-scope area is COMPLETE with linked behavioral evidence; missing AI/organization subscription/notification/offline capabilities are implemented if promised, or explicitly excluded in product copy and scope. A provisioned hackathon demonstration is not proof of self-service commercial completion.
2. A fictional carrier can enter through the selected onboarding model, configure effective company details, invite Drivers and selected office roles, recover access, and revoke it safely. Tenant/role isolation holds through APIs as well as navigation.
3. Complete text-PDF and manual intake → reviewed load → assignment/execution/stops → BOL/POD → human document validation → payment readiness → correct tenant invoice/packet → recorded submission → partial/final A/R. Exercise ordinary corrections/cancellation and rejected-document replacement. Include real browser/API/database integration in an isolated approved test environment; mocks alone are not sufficient final end-to-end evidence.
4. Approved charges and selected Driver settlement workflow have explicit review, correct exact totals, immutable issued/approved artifacts and adjustment history. Payroll/tax copy accurately describes preparation only unless those extra functions are implemented. Reconcile Finance imports, corrections, receipts and exported totals with an Owner using fictional records.
5. Capture installed-device evidence for every shipped mobile platform, including denied permissions, file formats, interruption/retry, restart, account switching, optional signatures and manual location. No completion or upload success is fabricated; Free work stays accessible.
6. Pro sandbox purchase/cancel/restore/expiry and cross-account receipt handling pass on the selected native store. Any organization plan has its own tested ownership/enforcement lifecycle. A development Test Store pass is labeled accordingly.
7. Required document assistance retains source/checksum/version and processing/review provenance, handles unsupported/failed input, and leaves financial decisions to the user. If OCR/AI remains absent, all claims match the actual text-parser/manual behavior.
8. Required notifications and Broker sharing work for the intended recipient, fail safely for revoked/expired/foreign access, and present honest retry/delivery states. Close the original first-open sharing issue with evidence from its actual authorized environment or keep it UNVERIFIED.
9. Existing layouts use the selected Manrope/DM Sans and navy/teal/mint palette consistently, with visible text, meaningful statuses, accessible focus/forms/tables/feedback and responsive/native acceptance evidence.
10. After approved implementation, run each changed area's targeted behavior/security checks, lint and typecheck; run the final agreed regression once and attach results/current revision and manual evidence. No outstanding P0, no silently waived P1, no claimed provider/device acceptance from unit tests. Production infrastructure readiness remains a separate decision.

### Checks performed for this assessment

Read-only product source/contract/schema inspection, report/test-artifact reconciliation, targeted searches for actual onboarding/staff/settings/notifications/subscriptions/AI paths, and comparison of declared brand requirements to shared web/native styling. Fresh focused mobile suite: **33/33 PASS**. Documentation structure, referenced repository paths and whitespace were checked. No full regression, application build, broad lint/typecheck, migration, database/provider operation or infrastructure re-audit was run.
