# LoadPacket — iPhone and RevenueCat acceptance

LP-SUBMIT-02, September 27, 2026. **Operator runbook: the external actions below have NOT been executed.** No sandbox purchase or native installation has been verified. Pro is personal to the authenticated LoadPacket application user, not the carrier organization.

## What is being purchased

**Pro Load Finder:** search your existing assigned loads by load number, pickup/delivery facility, address or reference; filter All, Active or Completed. My Loads contains the actual results and View Load actions. No new data is collected. Free Drivers still see all their assignment groups and can accept/start, record stop events, use maps, capture required documents, correct rejected documents and complete delivery.

Only verified, resolved entitlement for the current account unlocks Finder. Loading/error/expiry returns the complete free list. Account changes clear the screen and subscription identity. Expiration is checked locally from provider metadata; foreground return and a 60-second active-app refresh check RevenueCat for changes. Revocation is recognized on the next successful refresh, not by a server push. There is no app-owned persistent premium flag, organization entitlement or web purchasing.

## Native inspection and shortest path

- App: `LoadPacket Driver`, scheme `loadpacket`, version `1.0.0`.
- iOS bundle: `com.loadpacket.driver`, initial `buildNumber: "1"`; iPad supported.
- Android package: `com.loadpacket.driver`, initial `versionCode: 1`.
- `eas.json`: development client/internal, preview/internal, production/autoIncrement. Version source is remote, so EAS owns subsequent production build-number increments; local initial values alone do not establish store version history.
- No `extra.eas.projectId` or account owner binding was present. Link the intended existing EAS project if one exists; do not create a duplicate reflexively. Credentials and existing app records were not inspected.
- iOS requires authorized Apple Developer team access, matching bundle registration, signing certificate/provisioning and registered iPhone for internal distribution. This Windows host cannot run Xcode; EAS is the practical path if those prerequisites already exist.
- Android requires SDK/JDK/emulator for local native work; cloud builds require an EAS account and signing key. Play billing additionally requires an authorized Play account/app/product/test configuration. No physical Android device is necessary.
- No custom app icon/splash assets or icon/splash configuration were found. Expo defaults are not submission branding. Approved privacy, support and terms/EULA URLs are not provided in repository configuration; prepare real URLs and satisfy the selected store's current requirements before release. This sprint did not invent or publish these pages.
- Camera/photos purpose descriptions and foreground location purpose string exist. Background location and Android audio permissions are blocked. PDF/file picking is already supported. Exercise actual iPhone image-format output; unsupported HEIC should show a controlled validation message rather than pretend success.
- Release builds need correct public API/Supabase/RevenueCat configuration. A localhost API is the phone itself, not this PC. Use an approved reachable HTTPS test API with the current schema and fictional accounts. For a development client, Metro also needs a reachable LAN connection; an internal preview embeds its JS and avoids that dependency.

**Recommendation:** start with the available physical iPhone and the existing internal-preview profile if Apple/EAS access is already ready. Both platforms have passing JS exports; neither has a verified native build. If Apple access is absent but Play access already exists, Android may be faster. Fredrick must confirm provider/account and hackathon eligibility; source inspection cannot choose that for him. Internal installation is acceptance evidence, not public store publication.

## Configure RevenueCat and Apple first — EXTERNAL ACTIONS

Use the actual identifiers from your consoles. Angle-bracket names below are placeholders, not prescribed product IDs.

1. In RevenueCat select the intended project and iOS app with the exact bundle above. Verify store credentials/integration needed to validate transactions. Server keys/Apple private keys belong only in provider consoles; never in Expo public environment values or source.
2. In App Store Connect verify the matching app, authorized team and applicable agreements/tax/banking setup; configure an actual subscription product `<STORE_PRODUCT_ID>` with its real duration, localized title/description/price and availability. The benefit description must name Pro Load Finder. Confirm the product is available for sandbox testing; resolve missing metadata or agreements rather than hardcoding a price.
3. Import/link that product in RevenueCat. Create/select entitlement `<REVENUECAT_ENTITLEMENT_ID>` and attach the product. Using `pro` matches the repository default; another identifier requires the exact matching public environment value.
4. Add the product to a package `<PACKAGE_ID>` in offering `<OFFERING_ID>` and designate it the **current offering**. The app retrieves `current.availablePackages`; it does not hardcode an offering/package/product ID. Verify intended targeting does not leave the fictional Driver without a current offering.
5. Configure RevenueCat restore behavior **Keep with original App User ID** for this strict individual-account model. Every purchaser already signs into LoadPacket. The same user's restore should succeed; another account using that receipt must not inherit the purchase. This setting also blocks a new purchase on a receipt tied to another identified user, so support must direct the purchaser back to the original LoadPacket account. Do not silently enable sharing/transfer to make the test pass. [RevenueCat restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior)
6. Create an Apple sandbox tester in App Store Connect and enable any required RevenueCat sandbox-testing access for that tester/customer. The Apple sandbox identity is distinct from the fictional LoadPacket Driver login. Record identifiers privately, not in source or demo footage.
7. On the iPhone enable Developer Mode if the installation requires it. For iOS 18+, sandbox sign-in is under Settings → Developer → Sandbox Apple Account; older versions differ. If it is not visible, the initial sandbox purchase prompt can establish it. Verify the store dialog is a sandbox flow before completing anything. [RevenueCat Apple sandbox instructions](https://www.revenuecat.com/docs/test-and-launch/sandbox/apple-app-store)

Minimum public app environment (use `.env.example` names):

```dotenv
EXPO_PUBLIC_API_URL=https://<APPROVED_TEST_API>/api/v1
EXPO_PUBLIC_SUPABASE_URL=https://<SUPABASE_PROJECT_HOST>
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLIC_SUPABASE_KEY>
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=<IOS_PUBLIC_STORE_SDK_KEY>
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=<ANDROID_PUBLIC_STORE_SDK_KEY_IF_USED>
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=<REVENUECAT_ENTITLEMENT_ID>
```

iOS SDK keys start `appl_`; Android keys start `goog_`. This build rejects secret API keys, mismatched platform keys and RevenueCat Test Store keys. That avoids mistaking Test Store behavior for Apple/Play acceptance. Do not display full values in screenshots. The development-only Pro diagnostic displays configuration status, never the key itself.

Configure these in the corresponding **EAS development/preview environment** in the dashboard before the build. A git-ignored local `.env` is not sufficient evidence that a remote builder received them. For a development client, also put matching public values in ignored `apps/mobile/.env` for Metro. Inspect the resolved build environment privately. Rebuild after changing embedded configuration; reserve production values for the separately authorized production release.

## Exact build/install sequence

All commands are run by Fredrick after confirming their described effects. None performs store submission. Do not append `--auto-submit`.

**LOCAL: select the existing Node 24 runtime and application folder.**

```powershell
$env:PATH = 'C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH
Set-Location 'C:\Users\User\Documents\loadpacket\apps\mobile'
node --version
```

**EXTERNAL: fetch/use EAS CLI and authenticate; then link/create only the intended project if not already linked.** `init` may update app configuration and the EAS project. Review the diff afterward.

```powershell
pnpm dlx eas-cli whoami
pnpm dlx eas-cli login
pnpm dlx eas-cli project:info
# Only if project binding is missing, choose the correct existing project when prompted:
pnpm dlx eas-cli init
```

**EXTERNAL: register the physical iPhone for internal provisioning.** Open the registration URL/QR on that iPhone. Device registration at Expo must also be included in Apple's provisioning profile during the build; review the selected Apple team/device interactively. [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/)

```powershell
pnpm dlx eas-cli device:create
pnpm dlx eas-cli device:list
```

**EXTERNAL: upload build source/configuration to EAS, use/create signing material and consume build service resources.** Prefer preview for repeatable restart acceptance without a running Metro server:

```powershell
pnpm dlx eas-cli build --platform ios --profile preview
```

Open that build's installation URL/QR on the registered iPhone and install. Follow the device's trusted-development/Developer Mode prompts if shown. Record EAS build ID, installed version/build, iOS version and environment name without secrets. If the device was registered after an earlier build, produce a profile/build that includes it; do not assume the older artifact will install.

**Optional EXTERNAL development build instead of preview**, followed by **LOCAL LAN Metro server**:

```powershell
pnpm dlx eas-cli build --platform ios --profile development
pnpm exec expo start --dev-client --lan
```

Install the development build via its EAS link and open the Metro QR in that installed app. Both PC and phone must reach Metro and the API. Expo Go is not the acceptance runtime. These steps upload/build an internal app; they do not publish it to a store. [Expo device development build guidance](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/)

## Physical iPhone acceptance — run in order

Prepare fictional Driver **A** (initially Free), unrelated Driver **B** (Free), accepted invitations and three existing demo assignments: one In Progress, one Completed, one Upcoming. Put a distinct reference/city in each. Keep real carrier documents out of the test. Record Pass/Fail, build ID and redacted evidence per step.

1. **Login/My Loads:** sign in as A. Expect the correct assigned loads, visible locked Pro Load Finder and all normal groups. Pass/Fail: ____.
2. **Free operations:** accept/start an eligible assigned load; use maps and normal stop controls; ensure no purchase interruption. Pass/Fail: ____.
3. **Evidence:** exercise Take Photo, Choose Photo and Choose PDF/File with fictional BOL/POD. Test permission denial, retry, invalid format/oversize and a corrected rejected document. Expect clear errors and immutable version behavior. Pass/Fail: ____.
4. **Location:** deny permission when recording a stop; explicitly select Record Without Location. Expect real recorded action with no fabricated coordinates. Later allow foreground location and verify another event. No background tracking. Pass/Fail: ____.
5. **Completion:** supply required evidence and stop events, then complete delivery. Expect existing guard behavior without Pro. Pass/Fail: ____.
6. **Pro:** Account → View Pro. Expect Free status, real package title/description/localized price, actual billing period and accurate Finder description. An empty offering or configuration error is a failed prerequisite; do not create a fake price or unlock. Pass/Fail: ____.
7. **Cancel:** Continue → cancel the Apple purchase dialog. Expect cancellation notice, Free state and locked Finder. All assignments remain visible. Pass/Fail: ____.
8. **Sandbox purchase:** Continue → verify sandbox/test identity → complete the sandbox transaction. Expect Pro active after customer-info refresh and an Open Load Finder button. Confirm the transaction/entitlement in RevenueCat is attached to A's **application user ID from `/me`**, not email, Supabase subject or organization. Pass/Fail: ____.
9. **Use actual benefit:** Open Load Finder; search reference, mixed-case facility/city and load number; filter Completed then Active; clear filters. Expect only matching assignments, accurate counts, no-match guidance and working View Load. Clear restores all. Pass/Fail: ____.
10. **Restart:** force-close and reopen the installed preview app. Expect no temporary Pro content while identity/entitlement is unresolved, then valid A entitlement unlocks Finder. Pass/Fail: ____.
11. **Restore:** as A, tap Restore Purchases. Expect current entitlement and Finder access. Test without active entitlement on a separate tester account: no free grant. Pass/Fail: ____.
12. **Account switch:** sign out A, sign in B on the same device. Expect B's assignments and locked Finder immediately, with no retained search/notice from A. Attempt Restore as B against A's store receipt: no transfer under the configured restore policy. Sign back into A and verify valid access. Do not purchase again under B on A's receipt. Pass/Fail: ____.
13. **Provider/offline error:** disable network, press Refresh Status. Expect controlled error/locked Finder when verification fails, not a granted entitlement. Existing loaded free lists remain available; network-dependent mutations/uploads correctly report connection failures. Reconnect and refresh; valid entitlement recovers. Pass/Fail: ____.
14. **Expiry/revocation:** using sandbox controls, let an accelerated subscription expire or revoke the test entitlement; Refresh Status or foreground the app. Expect Finder locks and full free list returns once RevenueCat reports no active entitlement. A known expiration also locks while the screen stays open. Confirm behavior within the active refresh interval; this is not a webhook push guarantee. Pass/Fail: ____.
15. **Evidence capture:** record Free → real sandbox purchase → active Finder search/filter → restore, plus a separate Free core-workflow clip. Hide credentials, full app-user IDs, keys, tokens, real documents and email addresses. Preserve redacted sandbox dashboard proof and device/build details. Pass/Fail: ____.

Any account leakage, false unlock, native crash, real-charge prompt or blocked free operational action fails acceptance. Stop the test and record the exact reproducible step. Do not mark sandbox or iOS purchase verified from the automated mocked tests.

## Android emulator — optional platform path

**General native workflow:** install Android Studio/SDK/JDK and create an emulator; choose a Play-enabled image if also testing billing. With the approved public environment and a running emulator:

```powershell
# LOCAL BUILD; may download build dependencies and generate android/ native files.
Set-Location 'C:\Users\User\Documents\loadpacket\apps\mobile'
pnpm exec expo run:android
```

Test login, Free list/core actions, selected-file upload, emulated camera/location/denial and errors. This proves neither Google billing nor store eligibility. An optional EAS `build --platform android --profile preview` is an EXTERNAL upload/signing/build action; install the resulting APK through emulator tooling. Preserve any generated native files until reviewed; do not commit generated artifacts blindly.

**Google Play billing acceptance, only if Android is selected:** configure the actual Play app with matching package/signing, store product and active base plan/offer as applicable; connect RevenueCat's Android app/service credentials, import product, attach the same entitlement and current offering, and use the `goog_` public SDK key. Enroll a license tester and follow an eligible Play test-track/install setup on the emulator. Execute purchase/cancel/restore/account isolation with the test payment instruments, and verify sandbox transactions in RevenueCat. [RevenueCat Google sandbox guide](https://www.revenuecat.com/docs/test-and-launch/sandbox/google-play-store)

Physical Android hardware is not required. If submitting iOS only, Android billing acceptance is **DEFERRABLE**; retain the passing Android JS export and label native/billing acceptance accurately.

## Operator sign-off

Build ID: ____  Platform/OS: ____  Fictional test organization: ____

RevenueCat offering/package/product/entitlement recorded privately: ____

Restore policy confirmed: ____  Sandbox evidence location: ____

Free operations: ____  Finder: ____  Purchase: ____  Restore: ____

Restart/account isolation: ____  Offline/expiry: ____

REVENUECAT_SANDBOX_VERIFIED: NEEDS MANUAL TEST

IOS_PURCHASE_VERIFIED: NEEDS MANUAL TEST

READY_FOR_SUBMISSION: NO
