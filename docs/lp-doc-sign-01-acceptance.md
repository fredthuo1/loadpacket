# LP-DOC-SIGN-01 Manual Signature Acceptance

Status: NOT RUN on a physical device. Use fictional people, loads and documents only. Automated fixtures do not establish native acceptance. Signature captured != identity verified.

## Prerequisites

- Use a designated test environment with the API and native app from this change. LP-DOC-SIGN-02 applied `20260928090000_document_signatures` to the explicitly authorized configured development/test database (`aws-0-us-east-2.pooler.supabase.com:5432`, database `postgres`); 17 migrations current, empty schema drift and API startup/health/schema reads PASS. All 25 pre-existing business-table fingerprints are unchanged. The separate isolated `127.0.0.1:55439/loadpacket_finance_verified_test` remains migrated. **PRODUCTION_MIGRATION_APPLIED: NO.** The native rebuild and physical checklist below are still NOT RUN.
- Rebuild/install a development client containing `react-native-webview` 13.16.1. JS export alone does not install a native module. Prepare the authorized Driver, a different unrelated Driver, an Owner/Back Office reviewer, and another organization's account. Keep credentials out of screenshots and reports.
- Prepare an assigned, in-transit fictional load with BOL/POD requirements using the existing flow. Keep original fictional document bytes for comparison. Start with a Free Driver (no Pro entitlement).
- Record build/OS/device, API environment, migration status, account role, observed result and screenshot location for each scenario. Mark PASS only after observation.

## BOL — Driver

1. Sign in as the assigned Free Driver and open the fictional load.
2. Upload a fictional BOL through the existing camera/photo/file flow.
3. Confirm the upload state and normal navigation/workflow actions still work without a signature. There must be no new required-signature warning.
4. Tap **Add Signature** in the BOL evidence card.
5. Confirm full-screen signing context shows only LoadPacket, load/type, name, role, pad and signing actions. No drawer, account, Finance or other loads should be exposed within the modal.
6. Type `Fictional Shipper Alex`. Verify Shipper is the default and Driver is the other option; Receiver must not appear.
7. Draw a fictional signature. Verify the page does not scroll while drawing.
8. Tap **Clear Signature**. Attempt Save: no evidence should be created; the empty-state error should be readable.
9. Redraw. Open/dismiss the keyboard; confirm Save/Cancel remain reachable. Inspect safe areas and portrait narrow layout.
10. Tap **Save Signature** twice quickly. Confirm one in-flight state and one saved record.
11. Confirm return to the BOL card with captured name, Shipper role and time. No storage key/checksum should appear.
12. Leave and reopen the load. Confirm the captured state persists on the same BOL version.
13. Repeat on a separate fictional document with role Driver; verify typed name is still required and never inferred from the account.

## BOL — Back Office / Owner

14. Sign in as an authorized reviewer; open the existing load document review screen.
15. Confirm signer name, Shipper role, time and exact version label.
16. Select **View Signature**; confirm the image is readable. Close the preview. There must be no edit/delete controls.
17. Open/download the original BOL using the existing authorized action and compare its bytes/checksum with the original. The signature must not have been stamped into or overwritten the document.
18. Accept the document through the normal review action. Signature presence must not determine readiness.

## POD

Repeat steps 1–18 with a fictional POD and `Fictional Receiver Jordan`. The default must be **Receiver / Consignee**, with Driver selectable and no Shipper option. Verify upload, delivery and review still follow the existing rules. Capture POD Signature Mode and the captured evidence state.

## Failure, version and authorization checks

- **Skip:** upload another BOL/POD, never select Add Signature, and complete the existing delivery/review/payment-readiness path. No signature requirement should appear.
- **Cancel:** enter name/draw and cancel before Save. Reopen: no signature should exist from the cancelled capture.
- **Name/empty:** whitespace name or empty drawing must not save. Clear must reset drawing.
- **Offline:** draw/name first, disable networking, then Save. Confirm controlled failure, no false captured state, retained name/drawing. Restore networking and retry from the same modal: one record only. The retry intentionally locks the original payload; cancel/reopen starts a separate capture.
- **Interrupted response:** if the API saves but the response is lost, retry in the same modal. It must return the original record. Closing/restarting the app discards the in-memory retry key; check the load's evidence before starting a new capture.
- **Corrected version:** Back Office rejects a signed BOL; Driver uploads corrected BOL. New version must start unsigned. Back Office must see the prior signature explicitly marked Earlier version. Separately signing the new version must leave the old evidence unchanged.
- **Unrelated Driver:** attempt the known fictional document's list/capture/content endpoints with the other Driver's session. Denial must not reveal signature content.
- **Cross-organization:** repeat with the other organization's account and a mismatched version ID; access must be denied.
- **Read roles:** Owner/Back Office and existing authorized Dispatcher may read; those roles must not gain signature creation. Public Broker access must not expose signatures.
- **Free/Pro:** repeat capture with no entitlement. Then verify existing Pro Load Finder search/filter, locked Free state and account-switch isolation. Actual purchase/restore testing remains the separate `lp-ios-acceptance.md` operator task.
- **Finance:** verify signature capture creates no invoice/payment/ledger adjustment and does not change document/payment readiness.

## Visual evidence

Capture on a physical iPhone: BOL uploaded/Add Signature, POD Signature Mode, captured state, keyboard open/dismissed and narrow/safe-area layout. Repeat native pad/drawing/cancel/save/network failure on Android if included in the release.

Browser fixture screenshots are generated by `apps/web/test/signatures.spec.ts` at `apps/web/test-results/signature-review-desktop.png` and `signature-review-narrow.png`. They cover reviewer metadata, current/earlier versions, private-image preview and an unsigned POD with its normal Accept action. These are fictional browser fixtures, not native screenshots.

## Repeatable automated gate

From repository root, run `powershell -File scripts/finance-regression.ps1 -Full` using the existing approved isolated database. The wrapper fixes the database target, enables Finance/signature/stop-event database checks and restores process environment afterward. It does not apply migrations. The isolated DB must already have all repository migrations. Results and command logs go to `test-results/regression/<timestamp>/`.

Record device results here or in a linked acceptance record before claiming native acceptance. No device results are recorded by this implementation sprint.
