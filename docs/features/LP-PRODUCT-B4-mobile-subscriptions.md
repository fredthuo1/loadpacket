# LP-PRODUCT-B4 — Driver Mobile and Subscription Readiness

Updated: 2026-10-31. **RESULT: PARTIAL.** Independent mobile automated acceptance and bounded fixes are complete. Organization subscriptions are **BLOCKED at the schema/product/provider approval gate**. Installed-device and store acceptance are unverified. No B5 work began.

## Existing mobile features verified

Reused the Expo Router Driver app, Supabase/SecureStore session handling, existing invitation activation, driver-safe load projections, Autopilot, stop events, private document capture, optional signatures and personal Driver Pro. No replacement mobile app or billing integration was introduced.

Fresh mobile-to-API acceptance exercises assigned-load visibility and details, pickup/delivery information, accept/start, ordered arrive/depart events, BOL/POD upload, required-document completion blocking and completion. Duplicate commands preserve one event; repeated uploads are rejected without another document/version. Tenant and other-driver access are denied. Core execution works without Pro. Existing signature behavior remains independent of completion/Pro.

Invitation/password activation continues through the carrier email and existing web flow, followed by native password login. Existing HTTP tests verify pending-account restrictions, activation, duplicates, tampered subjects, resend and deactivation. No real email delivery, credentials, customer account or external identity administration was used. Password recovery reuses the existing web flow; it is not a second native authentication implementation.

## Implemented fixes

1. **Timeout/offline outcome:** the API deadline now includes reading the response body (30 seconds normal, 120 seconds multipart). Refresh-token waiting is also bounded. A lost/timed-out mutation reports an uncertain outcome and asks the Driver to refresh; it never claims rollback or automatically retries network failures. The existing one-time 401 replay preserves method, body and assignment token.
2. **Revoked access:** operational 403 responses invalidate the mounted application identity and recheck `/me`; `/me` denial cannot trigger an endless loop. Results from an earlier account cannot invalidate the new account. Foreground return revalidates authorization without unmounting a camera/file-picker session merely because revalidation started. Server authorization remains authoritative on every request.
3. **Stale screens:** generation guards ignore out-of-order refreshes and responses after blur/unmount. Failed assignment refresh clears cached loads/history. Load detail is keyed by load ID so pending upload state cannot travel to another load.
4. **Assignment-bound retry:** missing tokens fail locally with refresh guidance. Upload retry retains its original token, is cleared when the current generation changes and cannot borrow a replacement token. Capture affordances defensively match the existing server-supported types/states; the server already excludes office-generated invoices from Driver projections.
5. **Recovery/navigation:** a Forgot password button opens the existing `/auth/forgot` flow only from a configured HTTPS `EXPO_PUBLIC_WEB_URL` origin. Without it, the Driver gets carrier/web recovery instructions. URLs with embedded credentials, query tokens or unexpected paths are rejected. Existing navigation, accessible controls, loading/working messages and denied-permission guidance are preserved.

No dependency, lockfile, schema, API business service or provider configuration changes were needed for these mobile fixes. One existing source-boundary signature test expected the pre-B1b multipart syntax; it was updated to assert the current multipart construction and retained action token, without dropping signature/completion safeguards.

## Authentication, execution and evidence boundaries

SecureStore persistence, stale-restoration protection, role/onboarding gating, one shared refresh, sign-out and account-switch isolation retain targeted test coverage. Foreground authorization checks do not constitute push revocation: a previously displayed screen is not magically erased at the instant an administrator revokes access. The next authenticated request/foreground check denies access and removes the application view. The API independently prevents revoked mutations.

B1b action tokens remain server-issued and generation-bound. Driver correction/reassignment safety was not redesigned. New mobile HTTP tests prove same-driver stale tokens fail with 409 before upload storage writes, a new token is required, and other-driver reassignment/cancellation removes operational access. The prior B1b PostgreSQL race evidence remains documented in `LP-PRODUCT-B1b-load-corrections.md`; it is not represented as a new B4 concurrency run.

Uploads use existing private versioned evidence and server checksum/duplicate guards. A repeated upload can receive 409 after an uncertain first response; refresh reconciles the received document rather than creating another version. Rejected paperwork follows the existing correction flow. Retry files are held only while the screen/app remains alive. There is no durable offline queue or automatic background upload; after restart, refresh server state and choose the file again if still missing. Actual camera/photo picker, native file URI, GPS-denial and SecureStore persistence remain device acceptance items.

## Device and release coverage

- **Automated acceptance: PASS** for the scoped tests below. Native rendering/OS integration is not implied by logic tests or HTTP tests.
- **Local JS/Hermes export: PASS** for iOS and Android from final sources, using synthetic public configuration, `EXPO_NO_DOTENV=1` and offline mode. No real keys were embedded or printed. Artifacts are ignored under `test-results/b4-mobile/export-final/`.
- **Simulator/emulator acceptance: NOT RUN.** Android SDK/ADB and a `Pixel_8` AVD are present; ADB listed no connected device. No emulator was booted and no native development binary was built/installed. Windows has no Xcode iOS simulator. Java 11 is on PATH and Android Studio supplies Java 25; native toolchain compatibility was not qualified.
- **Physical iPhone acceptance: NOT RUN.** No installation, native permission, SecureStore restart, document capture or purchase evidence.
- **Physical Android acceptance: NOT RUN.** No connected device or physical acceptance evidence.
- **Store submission readiness: NOT QUALIFIED.** No Apple/Google submission, cloud build, signing operation or purchase was performed.

Repository configuration resolves `LoadPacket Driver`, version 1.0.0, scheme `loadpacket`, iOS/Android identity `com.loadpacket.driver`. Existing EAS binding is retained (`24843f19-db3f-44b3-b6b5-250ba4f1d433`, owner `thuofred1`); no remote ownership/signing claim was reverified. Profiles remain development client/internal, preview/internal and production/auto-increment, with remote version source.

Camera/photo purpose strings and foreground location descriptions exist. Background location and Android audio permissions are blocked. Expo 57.0.26, React Native 0.86.3, React 19.2.3 and RevenueCat SDK 10.10.0 were not upgraded. Offline `expo install --check` reported up to date and explicitly warned its validation is unreliable offline; this is not fresh online compatibility/store certification. No custom icon/splash or approved privacy/support/terms URLs were added. Release configuration, reachable HTTPS test API, signing, native installation and store metadata still require separate evidence. Older release reports describing an unlinked EAS project or unpatched Expo dependencies are historical, not current repository facts.

## Organization subscription finding and approval gate

**No organization subscription/entitlement model, provider webhook ledger or organization billing administration endpoint exists.** Load invoice/billing fields describe freight receivables, not a SaaS subscription. They must not be repurposed. Current RevenueCat integration identifies the application user and unlocks personal, client-side Pro Load Finder. It is not organization billing or server authorization for carrier operations.

Stop organization implementation here, as required by B4. The following is a proposed design, not shipped behavior. It does not assume a provider, price, trial length or grace period.

### Recommended policy for approval

- One subscription per organization covers that carrier's operational users. Drivers are not separately charged for core work. Keep current optional personal Pro unchanged until its commercial relationship to organization plans is explicitly decided; do not automatically transfer receipts or convert existing purchasers.
- Trial eligibility: an authorized Owner of an active organization that has never started a trial or paid subscription may request one. Persist the first trial timestamp permanently; changing Owner, canceling or relinking a provider does not restart it. This is organization-scoped eligibility, not a claim of protection against users creating multiple organizations.
- Trial and paid access use UTC server time and half-open intervals: access expires at `now >= endsAt`. Trial duration and past-due grace must be approved configuration, with no invented defaults. No row/unconfigured billing does not silently create a trial or charge an existing carrier.
- TRIALING and verified ACTIVE grant the approved organization capabilities. PAST_DUE retains them only through the approved grace deadline. Cancellation scheduled for period-end retains access through the already paid period. Immediate cancellation/expiry removes new dispatch/intake entitlements according to the approved policy.
- Recommended continuity mode after expiry: active authenticated Drivers may finish loads assigned before access expired, record stops, upload/correct required paperwork and read their permitted history. Owners retain billing recovery, existing evidence and permitted exports. New intake, new assignment and paid features are blocked server-side. Account/Driver revocation still denies access regardless of billing. This continuity policy needs explicit product approval before enforcement.
- Cancellation is an Owner command with idempotency and a displayed effective date. Resuming/correcting payment requests provider recovery; the client cannot mark itself paid. Access returns only after a verified authoritative state transition. Financial/document history and existing work are never deleted on cancellation.

### Smallest persistence proposal

Three additive tables with organization FKs; no changes to existing financial records:

1. **OrganizationSubscription:** organization ID as unique/primary tenant key, normalized lifecycle state, immutable first trial start/end, current access/paid-period end, grace deadline, cancellation-at-period-end flag, version and timestamps. Keep provider-specific IDs out of this domain record. Derive entitlement mode from state, deadlines and server policy instead of storing a client-editable premium boolean.
2. **OrganizationBillingLink:** integration-owned tenant mapping to selected provider/environment/customer/subscription references. Unique external mappings prevent attaching another tenant's subscription. Owner setup is server-mediated; never identify an organization by webhook email or a client-supplied organization ID.
3. **OrganizationBillingEvent:** tenant/link FK, provider/environment/event idempotency key, normalized event type/effective/received times, payload fingerprint, processing outcome and before/after subscription revision/state. Keep accepted source event data immutable and final application outcome immutable. Reject a repeated event ID with different content; exact repeats return the recorded outcome without extending dates.

A separate mapping table is needed because providers must stay outside the core domain, and the event ledger cannot safely double as the current external ownership mapping. An event ledger is needed for durable deduplication and audit; neither ordinary load events nor personal RevenueCat cache provides that.

### Enforcement and provider boundary

Add a provider-neutral billing adapter only after provider/channel approval. Verify webhook signatures and environment before resolving the server-owned tenant link. Unknown mappings must not create tenants or grant access. Serialize transitions per organization; validate authoritative provider state/version before applying delayed or out-of-order events so an older ACTIVE event cannot undo cancellation. Record duplicates/ignored stale events and sanitized failures. Reconcile failed delivery without granting speculative access.

Owner-only billing status/trial/cancel/recovery commands and read-only `/me` entitlement projections must derive tenant identity from authentication. Sensitive billing details stay Owner-only. Apply entitlement checks in domain transactions for new intake/assignment/paid operations; UI visibility is not enforcement. Existing role/assignment/document checks remain mandatory. Rollout must explicitly grandfather or enroll existing organizations; absent records must not unexpectedly lock out all existing carriers.

### Approvals required before subscription implementation

- Approve the three-table additive schema and a specifically verified isolated test migration target. No migration has been authored or applied in B4.
- Choose organization capability boundaries, trial eligibility/duration, past-due grace, cancellation effective-date rules, continuity mode and treatment of current carriers/personal Pro.
- Select provider and purchasing channels, authorized test configuration and event ownership. No prices are invented. Paid provider activation, transactions and production rollout require separate authorization.
- Obtain product/legal/store-policy decisions for the selected organization purchasing flow, disclosures, support/refunds/cancellation and relationship to personal in-app Pro. This report makes no claim of current store/legal approval.

Required future entitlement tests: exact trial/paid/grace expiry instants; trial reuse denial; cancel-at-end versus immediate cancel; continuity of old assignments versus blocked new work; Owner/Driver/tenant boundaries; forged client grants; duplicate/conflicting/out-of-order provider events; recovery; atomic revision races; audit immutability; safe existing-carrier rollout. **These organization tests are NOT RUN because the implementation is gated.** Existing personal Pro tests are not a substitute.

## Test results

- **41 mobile tests PASS**, including 8 new readiness tests: stalled-body timeout/abort, uncertain offline mutations/no replay, 403 revalidation without loops, account switching, latest-request publication, original-token retries, capture capabilities and safe web recovery links. Existing session/signature/Pro tests pass.
- **146 targeted HTTP tests PASS** across `mobile-driver`, `auth`, `driver-invitations`, `stop-events`, `document-review` and `invoice-terms` suites. Four new tests use the actual mobile transport against real local Nest HTTP routes, with synthetic identity/persistence/storage boundaries. They do not prove PostgreSQL locking or native multipart URI behavior.
- **27 B1b/B3 unit tests PASS** across action tokens, document intelligence, parser and storage compensation. No B3 application code changed.
- Mobile typecheck/lint PASS; API typecheck and new API-test lint PASS. Both final platform exports PASS. No broad regression.
- **Fresh B1b PostgreSQL concurrency rerun BLOCKED by local startup.** Two startup attempts on the existing exact isolated cluster failed with permission denied binding its socket; a Node bind probe on the same localhost port succeeded. No other database/port was substituted, no test SQL or migration ran, and `pg_ctl status` confirmed no server running. Prior 13-group B1b database evidence is reused only as prior evidence, not counted above.

Evidence: ignored `test-results/b4-mobile/mobile.xml`, `api-unit.json`, export metadata/bundles, and this turn's scoped HTTP/type/lint outputs. Earlier failed development checks were corrected (obsolete source-text assertion, existing event-name expectation, and an unnecessary invoice UI comparison); final results above reflect successful reruns.

## Files changed and next action

Mobile: `src/api/client.ts`, `src/auth/AuthProvider.tsx`, new `src/auth/recovery.ts`, new `src/lib/request-state.ts`, `app/login.tsx`, `app/(driver)/index.tsx`, `app/(driver)/loads/[loadId].tsx`, `.env.example`, `test/mobile.test.ts`, `test/signature.test.ts`, new `test/readiness.test.ts`.

API: new `apps/api/test/mobile-driver.e2e-spec.ts` only. Documentation: this report. No schema/dependency/package/build-profile changes. Unrelated workspace changes are preserved.

Next: review the focused organization subscription proposal, then authorize only the agreed schema/policy/provider work. Separately qualify an installed development build on emulator/device with synthetic accounts, camera/file/GPS permission denial, restart, revoked access and interrupted uploads. Resolve the isolated PostgreSQL startup before claiming a fresh real-database concurrency gate. No production deployment/migration, real payment, paid activation, store submission, customer data, commit/push or B5 work occurred.

Cleanup verified on 2026-10-31 after the user resumed: the task-created ADB daemon was stopped; the exact isolated PostgreSQL cluster reports no server running. No listeners remain on ports 5037/55439. Its data directory and ignored export/test evidence were retained. `git diff --check` and the B4 file whitespace check passed. An earlier cleanup attempt was not executed because automatic approval review had exhausted workspace credits; the resumed cleanup succeeded.
