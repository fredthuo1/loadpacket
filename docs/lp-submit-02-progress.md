# LP-SUBMIT-02 — Individual Pro benefit

Status: SOURCE_COMPLETE / MANUAL_ACCEPTANCE_REQUIRED. Node 24.19.0. Existing workspace changes preserved. No deployment, provider configuration, email, native build submission, purchase, commit or push.

## Decision recorded before implementation

Candidates inspected against current Driver data:

1. **Pro Load Finder (selected):** search existing assignments by load number, pickup/delivery facility, address or reference; narrow to active/completed assignments. Uses `/me/loads` and existing list/detail navigation, no new API or data authority.
2. Trip timeline summary: existing per-load events could be reformatted, but essential status history must remain free and this is less useful as a separate paid benefit.
3. Paperwork overview: existing requirement counts could support a summary, but missing-paperwork guidance is core workflow and should not be gated.

Free behavior: all Current/Upcoming/Completed lists and details remain browsable; accept/start/stop events, maps, required uploads, corrections and completion remain unchanged. A restrained Finder card explains the optional upgrade.

Pro behavior: the same list can be searched and filtered with result counts and a clear-filters action. Losing/unresolved entitlement returns the full free list immediately. No new export, stored personal data or organization subscription is introduced.

Affected files: mobile subscription service/provider/native adapter; My Loads, Account and Pro screens; one Finder domain helper and UI component; mobile tests; environment example comments; this checkpoint, iPhone runbook and readiness report. No API/schema dependency changes planned.

Expected effort: one bounded local implementation/test pass (approximately 3–5 engineering hours), followed by operator configuration and device acceptance.

Security boundary: only already-authorized Driver-safe data is filtered locally. The optional convenience feature is a client entitlement gate, not API data authorization or a tamper-proof financial control. RevenueCat customer information is authoritative for the unmodified client; no persisted premium boolean. Scope belongs to authenticated application user ID only. Unresolved/loading/error/expired entitlement must lock; account identity must match synchronously before rendering. Core API authorization stays unchanged.

Acceptance: fictional free Driver sees all assignments and a locked Finder; sandbox purchase unlocks search immediately; search by reference/address and Completed shows only matching assignments, with direct View Load access. Clear restores all. Restart/restore retains valid Pro; cancel/failure never unlocks; expiry/revocation locks; switching A to unrelated B never shows A's entitlement or filters. Free Driver can still execute the full required load workflow. Mocks establish source behavior only; actual sandbox/device proof remains manual.

## Verification plan

Preserve current tests; add deterministic Finder/entitlement tests for free/pro/loading/error, purchase/cancel/failure/restore, refresh, expiry/revocation, account races and cleanup. Run mobile typecheck, lint, all mobile tests, Expo compatibility and Android/iOS exports. Inspect actual native configuration and write external-action-labelled runbooks. No deploy, store submission, live email, real purchase, commit or push.

## Checkpoint

Completed: Pro Load Finder, accurate personal-Pro copy, SDK-key validation, identity-bound fail-closed entitlement gate, expiry timer, foreground/active refresh, focused tests, native inspection and operator runbook.

Last successful command: `node scripts/release-gate.cjs --scope=mobile` — **8/8 PASS**.

Evidence: `test-results/regression/2026-09-28T03-42-26-074Z/results.json` and sibling command logs. Mobile typecheck/lint PASS (no lint warnings); **25 tests PASS**, including all 16 existing tests and 9 new cases. Expo compatibility PASS; iOS and Android Hermes exports PASS; source/build secret audit and its 6 self-tests PASS. `git diff --check` PASS. These are source/bundle checks, not signed native compilation, store acceptance or sandbox purchase evidence. No API/shared/schema changes; full API/web regression was not repeated.

Next: Fredrick verifies Apple/EAS/RevenueCat account readiness, configures the actual store offering/entitlement and original-user restore policy, then follows `docs/lp-ios-acceptance.md` to build/install and test on the physical iPhone.

## Implementation details and limits

The optional Finder searches existing `/me/loads` projections only; API tenant/Driver authorization remains unchanged. No backend premium enforcement is needed for this local presentation convenience. This is not a tamper-proof server-side subscription boundary. Store customer info, never a persisted app boolean, determines access. The render boundary masks a prior account before the identity effect runs; operations carry expected user identity and reject stale responses. The Driver stack is keyed by account to discard old screens/data on switching.

Provider failures lock Finder with a safe generic error; known expiry schedules an immediate lock. Refresh invalidates SDK customer-info cache, and foreground return/60-second active polling detects provider changes. No instantaneous remote revocation guarantee is claimed; real offline/cache behavior must pass device acceptance. Loading temporarily restores the full Free list. Search/filter state resets when the premium view unmounts, including revalidation; no query is persisted or shared between users.

RevenueCat's restore setting must be **Keep with original App User ID**. Source-level race protection cannot override provider-authorized transfer/aliasing. Verify distinct fictional accounts in sandbox before declaring isolation accepted.

Native blockers remain external: project/signing binding, actual products/public keys, approved reachable API, device installation, sandbox transactions, branded icon/splash and required privacy/support/store metadata. The physical iPhone is the shortest evidenced acceptance path only if Apple/EAS access is ready. Android emulator workflow is supported as a plan; billing acceptance is deferrable for an iOS-only submission. No eligibility decision was made.

## Files changed in this sprint

- `apps/mobile/src/subscriptions/service.ts`
- `apps/mobile/src/subscriptions/SubscriptionProvider.tsx`
- `apps/mobile/src/subscriptions/native.ts`
- `apps/mobile/src/subscriptions/config.ts` (new)
- `apps/mobile/src/lib/load-finder.ts` (new)
- `apps/mobile/src/components/load-board.tsx` (new; reuses existing assignment cards/styles)
- `apps/mobile/app/(driver)/index.tsx`
- `apps/mobile/app/(driver)/pro.tsx`
- `apps/mobile/app/(driver)/account.tsx`
- `apps/mobile/app/(driver)/_layout.tsx`
- `apps/mobile/test/mobile.test.ts`
- `apps/mobile/.env.example` (comments only; no keys)
- `docs/lp-submit-02-progress.md` (new)
- `docs/lp-ios-acceptance.md` (new)
- `docs/lp-submission-readiness.md`

## Operator boundary

REVENUECAT_CODE_READY: YES for individual Pro Load Finder.

REVENUECAT_SANDBOX_VERIFIED: NEEDS MANUAL TEST.

IOS_PURCHASE_VERIFIED: NEEDS MANUAL TEST.

ANDROID_PURCHASE_VERIFIED: NEEDS MANUAL TEST; deferrable if Android is not selected.

RESTORE_PURCHASE_VERIFIED: NEEDS MANUAL TEST.

ORGANIZATION_PREMIUM_VERIFIED: NOT APPLICABLE.

READY_FOR_SUBMISSION: NO. P0 A1 source portion is closed; its provider/native acceptance portion is still open. Other submission blockers are unchanged. P1 B5 is closed by the approved personal scope and corrected app copy; readiness counts are now 4 P0, 5 P1 and 12 overlapping human-required items.
