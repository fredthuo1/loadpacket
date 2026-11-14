# Current write paths and acknowledgement points — LP-PROD-001

Evidence: SOURCE, inspected 2026-10-01. These are code traces, not runtime packet captures. All API routes below use `/api/v1`. [Controller inventory](mutation-route-inventory.md) and [mutation audit](mutation-audit.md) cover additional families. Nest awaits a returned service promise: returning a value **inside** a Prisma transaction callback is not the HTTP ACK; the outer transaction promise must resolve after commit first. Conversely a client timeout can follow a committed write.

Common AUTH CHECK: [global auth/invitation/role guards](../../apps/api/src/auth/auth.module.ts) map a verified bearer identity to active app User/organization/role. No tenant ID from a payload replaces this authority. EXTERNAL CALL below means a business side effect beyond common token verification; Auth/JWKS requests may occur on any protected route. File writes use the [local adapter](../../apps/api/src/documents/document-storage.ts), with no explicit fsync or regional durable receipt. DB commit success reflects the configured database guarantee, which is UNKNOWN. No universal remote-durability gate, operation outcome registry or transactional outbox exists.

## 1. Rate Confirmation upload

SOURCE: [controller](../../apps/api/src/documents/documents.controller.ts), [saveRateCon](../../apps/api/src/documents/documents.service.ts) (method begins line 35; file put 68, create 71, result 112).

- **CLIENT:** web Smart Intake multipart upload.
- **API ENDPOINT:** POST `/api/v1/documents/ratecon`, 201 on success.
- **AUTH CHECK:** OWNER or DISPATCHER; validated multipart size/type and empty body DTO.
- **TENANT CHECK:** organization comes from authenticated user; uploader recorded.
- **DB TRANSACTION:** nested Document + DocumentVersion create is atomic; no encompassing file/DB transaction.
- **FILE WRITE:** SHA-256 computed, new UUID `v1.pdf` key; awaited local put **before** DB create.
- **EXTERNAL CALL:** none beyond common auth; extraction is separate.
- **AUDIT:** DocumentVersion uploader/time/hash; no LoadEvent or separate durable action audit at this stage.
- **IDEMPOTENCY:** new document UUID per request; no stable request replay key. Catch checks for committed storage key and removes only when absence is established; uncertain outcome preserves file.
- **RESPONSE ACK POINT:** after local put and successful nested create, service returns document/version metadata. It does not wait for extraction, remote copy, scan or independent backup.

## 2. Extraction and draft metadata

SOURCE: [text extractor](../../apps/api/src/documents/ratecon-text-extractor.service.ts), [status update](../../apps/api/src/documents/documents.service.ts), [draft parser](../../apps/api/src/documents/ratecon-draft.service.ts).

- **CLIENT:** web Smart Intake/review.
- **API ENDPOINT:** POST `/api/v1/documents/:documentId/extract-text` and `/ratecon-draft`.
- **AUTH CHECK:** OWNER/DISPATCHER.
- **TENANT CHECK:** findDocument filters tenant, rejects vault permission bypass, verifies RATE_CONFIRMATION.
- **DB TRANSACTION:** individual status update to TEXT_EXTRACTED; already advanced statuses are not demoted. No persisted extraction-result model/transaction.
- **FILE WRITE:** none; reads latest private evidence bytes and parses PDF locally.
- **EXTERNAL CALL:** none; local pdf-parse and deterministic entity parsing.
- **AUDIT:** document status/update timestamp only; extracted text, page/character counts, parsed draft and warnings are returned, **not durably stored as a processing record**.
- **IDEMPOTENCY:** repeat parsing and monotonic status check, not a request-key/result replay protocol.
- **RESPONSE ACK POINT:** extractor returns after status advancement and awaited parser cleanup; draft endpoint then returns parsed fields/warnings. Success is not financial confirmation. A later parser/response failure may leave TEXT_EXTRACTED committed. Original file survives parsing failure; no current durable confidence/processing ledger may be claimed.

## 3. Load creation

SOURCE: [LoadsService.create](../../apps/api/src/loads/loads.service.ts) (38–267), [manual create](../../apps/api/src/loads/manual-loads.service.ts), [controller](../../apps/api/src/loads/loads.controller.ts).

- **CLIENT:** web reviewed RateCon or manual-load form.
- **API ENDPOINT:** POST `/api/v1/loads` or `/api/v1/loads/manual`, 201.
- **AUTH CHECK:** OWNER/DISPATCHER and DTO validation.
- **TENANT CHECK:** tenant source-document lookup; all created rows use authenticated organization.
- **DB TRANSACTION:** creates Load/stops/requirements and source link where applicable; RateCon document becomes CONFIRMED; LOAD_CREATED event in same callback transaction. Manual path creates no fabricated source document.
- **FILE WRITE:** none; references previously uploaded evidence.
- **EXTERNAL CALL:** none.
- **AUDIT:** LOAD_CREATED with actor/metadata in transaction.
- **IDEMPOTENCY:** RateCon existing-link read returns `created: false` before starting new transaction; org/load-number unique constraint. No payload-hash replay or shared request key; concurrent same-document/different-load-number race must be tested, because initial lookup is outside the transaction.
- **RESPONSE ACK POINT:** existing-link response after read, otherwise after transaction promise resolves. No file integrity/remote durability recheck occurs at creation ACK.

## 4. Driver assignment

SOURCE: [LoadsService.assignDriver](../../apps/api/src/loads/loads.service.ts) (385–549), [driver lock](../../apps/api/src/drivers/driver-lock.ts).

- **CLIENT:** owner/dispatcher load controls.
- **API ENDPOINT:** POST `/api/v1/loads/:loadId/assign-driver`.
- **AUTH CHECK:** OWNER/DISPATCHER.
- **TENANT CHECK:** tenant load read; locked active Driver and current load verified in organization.
- **DB TRANSACTION:** Driver lock, load FOR UPDATE, BOOKED recheck, assignment upsert and event.
- **FILE WRITE:** none.
- **EXTERNAL CALL:** none; no assignment push/email delivery guarantee.
- **AUDIT:** DRIVER_ASSIGNED event in transaction.
- **IDEMPOTENCY:** unique org/load assignment prevents multiple rows, but repeat upsert can reset accepted state/time and create another event while load remains BOOKED. It is not exact replay.
- **RESPONSE ACK POINT:** awaited transaction completes, then service assembles load/assignment response. Return inside callback at line 535 precedes commit; outer response begins 538.

## 5. Driver acceptance and start

SOURCE: [driver lifecycle service](../../apps/api/src/drivers/drivers.service.ts) (`acceptLoad` 353; `startLoad` 483), [me controller](../../apps/api/src/drivers/me-driver.controller.ts), [legacy driver controller](../../apps/api/src/drivers/drivers.controller.ts).

- **CLIENT:** native Driver or driver web UI; legacy role-controlled owner operations also exist.
- **API ENDPOINT:** POST `/api/v1/me/loads/:loadId/accept` and `/start`; legacy `/api/v1/drivers/:driverId/loads/:loadId/accept|start`; 200.
- **AUTH CHECK:** DRIVER/mapping on `/me`; legacy controller role policy is separate and does not authorize arbitrary cross-tenant Driver actions.
- **TENANT CHECK:** active same-tenant Driver, organization/load/driver assignment; `/me` supplies the mapped Driver ID.
- **DB TRANSACTION:** load row lock; acceptance updates assignment, start updates assignment + load; state checks and event in same transaction.
- **FILE WRITE:** none.
- **EXTERNAL CALL:** none.
- **AUDIT:** DRIVER_ACCEPTED or LOAD_STARTED transaction event.
- **IDEMPOTENCY:** selected repeated current-state transitions return original/current state without duplicate event; later progression can reject an old retry. No durable universal request response.
- **RESPONSE ACK POINT:** returned Prisma transaction resolves before HTTP 200. No push/provider or regional receipt is awaited.

## 6. Stop arrival/departure

SOURCE: [StopEventsService.record](../../apps/api/src/drivers/stop-events.service.ts) (21–127).

- **CLIENT:** native/web Driver stop controls with optional foreground location.
- **API ENDPOINT:** POST `/api/v1/me/loads/:loadId/stops/:stopId/arrive|depart`, 200.
- **AUTH CHECK:** DRIVER with active user-to-driver mapping.
- **TENANT CHECK:** load lock with organization, assignment and tenant stop lookup; driver userId rechecked.
- **DB TRANSACTION:** serializes with other load transitions, enforces stop sequence, updates server timestamp and event atomically.
- **FILE WRITE:** none.
- **EXTERNAL CALL:** no server location provider; client location is supplied evidence, not server-verifiable truth.
- **AUDIT:** corresponding ARRIVED/DEPARTED event includes location availability and submitted location metadata.
- **IDEMPOTENCY:** existing action timestamp returns `duplicate: true`, even after later progression; no payload hash comparison, so changed location on a repeated action is not a new accepted observation.
- **RESPONSE ACK POINT:** after transaction resolution, returns updated/original timestamps; no independent durable operation receipt.

## 7. BOL/POD capture and correction

SOURCE: [capture service](../../apps/api/src/documents/driver-document-capture.service.ts) (27–240).

- **CLIENT:** mobile camera/gallery/PDF selection or driver web upload.
- **API ENDPOINT:** POST `/api/v1/me/loads/:loadId/documents/:documentType`; legacy `/drivers/:driverId/loads/:loadId/documents/:documentType`.
- **AUTH CHECK:** mapped DRIVER on `/me`, separate legacy role policy; file size/type guards.
- **TENANT CHECK:** tenant load/active driver/assignment, allowed transit/delivered state, tenant requirement.
- **DB TRANSACTION:** load + requirement row locks; requires MISSING/REJECTED; creates Document if needed, immutable new version, load link, RECEIVED requirement and event.
- **FILE WRITE:** local put at line 136 **inside** interactive transaction, before metadata writes. SHA-256 and new key; rollback cannot atomically undo a filesystem effect.
- **EXTERNAL CALL:** none; no malware scanner or regional copy.
- **AUDIT:** DOCUMENT_CAPTURED event in SQL transaction.
- **IDEMPOTENCY:** accepted upload blocks another by requirement state, but there is no client key that returns the original success after lost ACK. Correction adds a version. Ambiguous cleanup preserves bytes when DB cannot prove absence.
- **RESPONSE ACK POINT:** after file put and outer transaction commit; not after cross-region evidence survival. A retry after success may report conflict.

## 8. Document signature

SOURCE: [SignaturesService.capture](../../apps/api/src/documents/signatures.service.ts) (110–247), [controller](../../apps/api/src/documents/signatures.controller.ts).

- **CLIENT:** Driver native/web signature capture UI.
- **API ENDPOINT:** POST `/api/v1/documents/:documentId/signatures`.
- **AUTH CHECK:** assigned DRIVER only; validates PNG and signer input.
- **TENANT CHECK:** exact tenant document/load/link, active assignment, current BOL/POD version and eligible requirement; reauthorization under load lock.
- **DB TRANSACTION:** tenant+actor+request-key advisory lock, load row lock, previous payload comparison; creates signature and event. Composite FKs bind exact version and role.
- **FILE WRITE:** signature PNG SHA-256; local put inside transaction at line 189; immutable fresh key.
- **EXTERNAL CALL:** none.
- **AUDIT:** DOCUMENT_SIGNATURE_CAPTURED in same transaction; signer/actor/version/time stored. Document checksum is available through the referenced version, not independently snapshotted in signature row.
- **IDEMPOTENCY:** org + actor + idempotencyKey unique; same evidence returns existing signature, mismatched version/name/role/checksum conflicts. Mutable authorization is rechecked. Uncertain commit cleanup retains bytes.
- **RESPONSE ACK POINT:** `return await db.$transaction` resolves after commit (callback view at 226), after local write. This does not verify two regional copies of either document or signature.

## 9. Load completion

SOURCE: [DriversService.completeLoad](../../apps/api/src/drivers/drivers.service.ts) (627–809).

- **CLIENT:** Driver delivered/complete controls.
- **API ENDPOINT:** POST `/api/v1/me/loads/:loadId/complete`, legacy `/drivers/:driverId/loads/:loadId/complete`; 200.
- **AUTH CHECK:** same lifecycle route policy as acceptance.
- **TENANT CHECK:** active Driver and tenant assignment/load.
- **DB TRANSACTION:** load row lock; requires IN_PROGRESS/IN_TRANSIT and no REQUIRED driver paperwork MISSING/REJECTED; updates assignment COMPLETED, load DELIVERED and event.
- **FILE WRITE:** none; checks metadata requirement status, not current physical existence/checksum/regional durability of bytes.
- **EXTERNAL CALL:** none.
- **AUDIT:** LOAD_COMPLETED in transaction, requiredPaperworkComplete metadata.
- **IDEMPOTENCY:** COMPLETED + DELIVERED returns existing state without another event; later states are not universal replay.
- **RESPONSE ACK POINT:** after transaction resolution. Delivery ACK is not evidence validation/payment readiness ACK, nor a storage survivability check.

## 10. Finance transaction and import lifecycle

SOURCE: [FinanceService.create](../../apps/api/src/finance/finance.service.ts) (222–377), [imports](../../apps/api/src/finance/finance-import.service.ts), [controller](../../apps/api/src/finance/finance.controller.ts), [payment service](../../apps/api/src/loads/accounts-receivable.service.ts).

- **CLIENT:** Finance web form/import wizard; accounts receivable payment UI.
- **API ENDPOINT:** POST `/api/v1/finance/transactions`, `/finance/imports`, `/finance/imports/:id/preview|confirm|reverse`.
- **AUTH CHECK:** OWNER/BACK_OFFICE; service-specific driver-pay/correction and sensitive-document validation.
- **TENANT CHECK:** authenticated organization, all linked load/driver/document/correction/batch lookups scoped; composite FKs on financial associations.
- **DB TRANSACTION:** org advisory lock for Finance/imports. Manual record + FinancialAuditEvent atomic. A PAYMENT with loadId delegates to existing row-locked payment ledger. Upload stores original bytes + audit; preview replaces unconfirmed staging rows and increments revision; confirmation (60s timeout) creates history/transactions and audit; reversal changes allowed statuses and records audit. Triggers protect immutable non-status financial fields and cross-live/history identities.
- **FILE WRITE:** import source retained in DB `fileBytes`, not DocumentStorage; checksum and size cap. No external storage for import originals.
- **EXTERNAL CALL:** none; CSV/XLSX parsed locally.
- **AUDIT:** transaction creation/adjustment, import upload/confirmation/reversal audit in transaction. Preview staging refresh does not create a separate FinancialAuditEvent in current code. Payment delegation uses PAYMENT_RECEIVED event.
- **IDEMPOTENCY:** org transaction key plus field comparison; payment per-org/load key; import org/file checksum duplicate returns existing; confirmation uses batch state + revision and per-row provenance; preview stale revision conflicts. No universal replay protocol across every import action.
- **RESPONSE ACK POINT:** manual transaction/upload after outer transaction; preview/confirm/reverse first commit then call `detail()` (lines 226/390/440). A detail-read failure can therefore return an error **after successful mutation**. No durable client outcome endpoint exists. Backup/regional commit contract is not checked by these paths.

## 11. Driver invitation, resend and completion

SOURCE: [invitation service](../../apps/api/src/drivers/driver-invitation.service.ts), [controller](../../apps/api/src/drivers/driver-invitation.controller.ts), [provider adapter](../../apps/api/src/integrations/supabase).

- **CLIENT:** owner Driver management; invited Driver onboarding completion.
- **API ENDPOINT:** POST `/api/v1/drivers/:driverId/invite`, `/invite/resend`; POST `/api/v1/me/complete-invitation`; 200.
- **AUTH CHECK:** OWNER for invite/resend; DRIVER for completion with explicit pending-invitation exception.
- **TENANT CHECK:** locked same-tenant active Driver, application identity/email/mapping consistency; local email is never authority to link an arbitrary external identity.
- **DB TRANSACTION:** invite (30s) creates app User, driver mapping and invitation; resend (20s) updates lastSentAt; completion updates pending invitation under mapping checks.
- **FILE WRITE:** none.
- **EXTERNAL CALL:** provider invite/resend is awaited **inside** transaction before SQL commit. Provider success is not mailbox-delivery confirmation. Compensation only considers newly created identity and checks for any committed mapping; uncertainty requires review.
- **AUDIT:** selected metadata-only Logger calls after transaction; not a transactional SQL audit/outbox.
- **IDEMPOTENCY:** existing driver mapping returns current status; resend 60s cooldown; no durable provider operation key. Email/provider success followed by failed SQL commit remains a reconciliation case.
- **RESPONSE ACK POINT:** after provider result and DB transaction resolution, then local audit log, returns INVITE_PENDING; completion returns CONNECTED after commit. It does not wait for email delivery or for independent backup. Blind transaction retry would risk duplicate external effects.

## 12. RevenueCat subscription state

SOURCE: [native adapter](../../apps/mobile/src/subscriptions/native.ts), [subscription service](../../apps/mobile/src/subscriptions/service.ts), schema/API search.

- **CLIENT:** native subscription/restore UI, keyed to app User.id.
- **API ENDPOINT:** no LoadPacket server subscription update/webhook endpoint found; direct RevenueCat SDK.
- **AUTH CHECK:** stable current app identity and client account-switch checks; RevenueCat/store authentication is external.
- **TENANT CHECK:** no organization subscription DB state exists; current integration is individual mobile entitlement state, not organization-wide server billing authorization.
- **DB TRANSACTION:** none in LoadPacket for subscription state.
- **FILE WRITE:** none in DocumentStorage; SDK state is not freight evidence.
- **EXTERNAL CALL:** configure/login, purchase/restore and refreshed customer info; entitlement state updated locally from provider result.
- **AUDIT:** no authoritative LoadPacket subscription event ledger found.
- **IDEMPOTENCY:** purchase/restore semantics belong to SDK/provider; do not claim generic LoadPacket idempotency.
- **RESPONSE ACK POINT:** mobile purchase adapter awaits provider action then refreshed customer info; client service checks current identity/entitlement. No LoadPacket SQL durability ACK exists to trace. Native provider acceptance remains unverified in this audit.

## Cross-cutting conclusion

SOURCE establishes that normal DB-changing service promises generally await commit; it does **not** establish ACK-time regional durability. Local filesystem completion is the evidence boundary today; extraction processing records, common outcome reconciliation and provider-intent atomicity remain incomplete. Preserve existing same-key Finance/signature safeguards during later work. A generic retry wrapper would make some operations less safe.

The future [database POC](database-poc-plan.md) separates DB durability tests from end-to-end operation adoption, and the [object POC](object-storage-poc-plan.md) must prove receipt-time bytes survive. Until both and the [release gates](release-gates.md) pass, RPO 0 must not be advertised.
