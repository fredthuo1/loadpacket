# LP-PRODUCT-B4.2 — Driver mobile native acceptance

## Current iPhone acceptance checkpoint — 2026-11-10

**RESULT: BLOCKED. iOS: NOT VERIFIED.** The user confirmed that a physical iPhone is available but **no LoadPacket development build is installed**. No physical-device test has run in this checkpoint. Local automated preparation passes; it is not native acceptance. The current ticket concerns iPhone acceptance; Android evidence below is historical and was not rerun.

### Readiness and build reuse

- Node **24.22.1**, pnpm **12.3.4** verified locally. Installed Expo **57.0.26**, React Native **0.86.3**, development client **57.0.19**, SecureStore **57.0.4**. No dependencies or identifiers changed.
- Existing `development` profile already selects an internal physical-iOS development client, Node 24.22.1, pnpm 12.3.4 and the EAS `development` environment. No configuration edit is necessary for that profile.
- Offline native-config introspection passes: `com.loadpacket.driver`, scheme `loadpacket`, app version `1.0.0`; camera, photo-library, foreground-location and development local-network permission descriptions resolve. Bonjour includes `_expo._tcp`; no background location mode is configured. These are generated configuration observations, not permission-prompt/device results. Remote versioning means the eventual signed build number must be recorded from the actual build.
- There is no installed iPhone client to reuse. The saved `test-results/b42-mobile/eas-builds.json` lists only the historical Android build `69384948-a152-42c4-a7da-a249801b8bcf`. It does **not** prove that no iOS build exists in EAS today. Current remote build inventory, Apple team membership, signing credentials, provisioning validity and device UDID inclusion remain unverified.
- After explicit approval for read-only EAS access, check for a finished compatible iOS **development** build first. A valid existing IPA that includes this phone and matches the current native modules/configuration can avoid a new cloud build. Missing UDID or invalid provisioning requires a separately approved signing/re-signing or build action; do not silently start one.
- The prior online Expo compatibility check failed with six patch recommendations on **2026-11-01** (listed in historical evidence below). No online check or package upgrade ran today. Treat that as an unresolved historical qualification issue, not a fresh registry result or proof that native compilation fails. Obtain approval for a bounded online recheck and any necessary patch ticket before a new cloud job.

### Security and runtime verification

- Native Supabase session persistence uses **Expo SecureStore** (`getItemAsync`, `setItemAsync`, `deleteItemAsync`), with session restoration and foreground refresh. Real iPhone keychain/restart behavior remains NOT RUN.
- Invitation/password setup and recovery use the existing HTTPS web flow, followed by native login. Recovery accepts a configured HTTPS root web origin and otherwise shows carrier instructions. The `loadpacket` scheme is registered for app routing; no native Supabase callback consumer was established. Do not substitute `loadpacket://` for the existing web auth callback configuration.
- Mobile HTTP acceptance exercises the real Nest guards/controllers/services with synthetic in-memory persistence, token verification and document storage. It checks assigned-only visibility, exclusion of broker/rate fields, lifecycle/stop actions, BOL/POD guards and uploads, duplicate commands, same-Driver stale generation rejection before storage, revoked access, reassignment and cancellation. Invitation tests cover tenant/role boundaries, pending-account activation, invalid subjects and idempotency through synthetic identity-provider fixtures.
- Mobile tests cover restoration/sign-out races, single-refresh handling, revoked-account notification, account isolation, bounded response-body timeouts, uncertain mutations without automatic replay, stale upload generations, file/capture rules and HTTPS recovery validation. None establishes live Supabase delivery, native file handling, GPS accuracy or physical accessibility.
- No approved non-production API/web/Supabase environment has been identified for this checkpoint. Do not use existing `.env` destinations by assumption. No real account, remote API or document store was contacted by these tests.

### Actual checks and evidence

- **PASS:** 22 selected mobile tests; 0 failures.
- **PASS:** mobile TypeScript check and mobile ESLint; both exit 0.
- **PASS:** `mobile-driver.e2e-spec.ts` and `driver-invitations.e2e-spec.ts`: **26 tests / 2 suites**, 0 failures. Database and identity/storage fixtures replace external boundaries; no database migration or live database acceptance occurred.
- **PASS:** offline Expo native-config introspection with dotenv disabled, synthetic `.invalid` public URLs and empty RevenueCat keys. This generates configuration only; it is not an IPA build.
- **PASS:** `git diff --check` (exit 0); the untracked report also has no trailing whitespace or conflict markers. Git emitted existing LF/CRLF notices, not whitespace errors.
- Logs/config retained under ignored `test-results/b42-mobile/2026-11-10/`: `mobile-tests.log`, `mobile-typecheck.log`, `mobile-lint.log`, `driver-http.log`, `expo-introspect.json`.
- **Minimal fixes: none.** No confirmed defect surfaced in these focused checks. This checkpoint changes only this report; previous workspace changes remain intact. No B4.1, broad web or financial regression was run.

Repeat the local checks from repository root with Node 24 on PATH:

```powershell
$env:EXPO_NO_DOTENV='1'
$env:EXPO_OFFLINE='1'
pnpm --config.verify-deps-before-run=false --filter mobile exec tsx --test --test-name-pattern='session|sign-out|driver|Driver|401|request|upload|file|location|deadline|revoked|forbidden|offline|refresh|capture|recovery|generation|blur' test/mobile.test.ts
pnpm --config.verify-deps-before-run=false --filter mobile typecheck
pnpm --config.verify-deps-before-run=false --filter mobile lint
$env:NODE_ENV='test'
$env:DATABASE_URL=''
$env:DOTENV_CONFIG_QUIET='true'
pnpm --config.verify-deps-before-run=false --filter api exec jest --config ./test/jest-e2e.json --runInBand --runTestsByPath test/mobile-driver.e2e-spec.ts test/driver-invitations.e2e-spec.ts
git diff --check
```

### Approval gates and exact next steps

**Do not execute the external steps below until explicitly approved.** This applies to the older command walkthrough later in this document as well. No EAS account query, cloud build, Apple account action, environment update, installation service or other external service operation was executed in this checkpoint.

1. Identify the approved non-production API origin, web origin and Supabase project identifier. Confirm permission to mutate only synthetic accounts, loads and documents. Do not send credentials. Confirm an authorized test Owner can perform reassignment and deactivation during acceptance. Confirm the test auth provider already permits the existing HTTPS invitation/recovery callbacks; changing provider configuration requires approval.
2. Approve read-only EAS project/build inventory and review the unresolved compatibility check. Use the locally installed CLI; do not install or upgrade tooling implicitly. After that approval, run these exact PowerShell commands:

   ```powershell
   Set-Location 'C:\Users\User\Documents\loadpacket\apps\mobile'
   $env:PATH='C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;'+$env:PATH
   $eas='C:\Users\User\AppData\Local\npm-cache\_npx\cdcf29a1293ceb8d\node_modules\eas-cli\bin\run'
   if (!(Test-Path -LiteralPath $eas)) { throw 'Approved cached EAS CLI is unavailable.' }
   $env:EXPO_NO_DOTENV='1'
   node $eas whoami
   node $eas project:info
   node $eas build:list --platform ios --limit 5
   ```

   Verify the existing project `thuofred1/loadpacket-driver`, ID `24843f19-db3f-44b3-b6b5-250ba4f1d433`. Do not create a replacement project. If authentication is required, stop for approval before login. Review matching build profile, artifact and provisioning before deciding whether a new build is necessary.
3. If no reusable build exists, obtain separate explicit approval for Apple device registration/signing and one EAS iOS development build. Confirm existing Apple membership/team permissions and available EAS allowance first. Stop if enrollment, payment, plan upgrade or certificate revocation would be needed. The precise commands after approval are `node $eas device:create`, then `node $eas build --platform ios --profile development`. Follow the detailed Windows/iPhone signing walkthrough below. No `submit`, `--auto-submit` or production build profile.
4. After authorized signing/build completion (or verified compatible existing artifact), use its installation link in Safari on the registered iPhone. Enable Developer Mode if required and restart. Record EAS build ID, actual app/build version, iPhone model and iOS version; never share signing credentials or the device UDID in this report.
5. Use the detailed Metro commands below with **approved public test values**, dotenv disabled and RevenueCat keys empty. PC and phone must share trusted LAN access; `127.0.0.1` on the phone is not this Windows computer. `expo run:ios` is not the Windows build path. Do not start a tunnel, change firewall policy or substitute Expo Go without addressing the applicable gate.
6. Confirm installation and environment readiness, then run the physical checklist with the user. Retain redacted evidence and operation/event counts for retries. No successful automated test may be recorded as a device PASS.

### Physical iPhone acceptance matrix

Each item requires the installed-build identity and approved synthetic environment before execution:

- Build installed, signing valid, environment approved: **BLOCKED** — no installed build; environment/signing unconfirmed.
- Launch, login, validation and keyboard: **NOT RUN**.
- Invitation activation and recovery handoff: **NOT RUN**.
- Session restoration after force-close/restart: **NOT RUN**.
- Assigned-only loads/details; no broker/rate fields: **NOT RUN**.
- Accept/start; pickup/delivery arrive/depart: **NOT RUN**.
- Camera/photos/Files/local-network/location permission allow, deny and recovery: **NOT RUN**.
- BOL/POD camera capture and Files upload; required-document completion guard: **NOT RUN**.
- Interrupted upload, timeout and reconciliation before retry: **NOT RUN**.
- Completion and duplicate-action protection: **NOT RUN**.
- Same-Driver reassignment with stale action/upload generation: **NOT RUN**.
- Driver deactivation and session revocation: **NOT RUN**.
- Airplane Mode/network recovery and safe retry: **NOT RUN**.
- Logout, restart and second-account isolation: **NOT RUN**.
- Safe areas, large text, VoiceOver and keyboard reachability: **NOT RUN**.

**Next task:** approved iOS artifact/signing preparation followed by the above physical acceptance, within B4.2. Do not start organization subscriptions, B5 or production work. Local preparation is complete; B4.2 itself remains blocked until installation and physical results are recorded.

## Historical evidence — 2026-11-01

The following records earlier work. Its online compatibility results, environment observations, external account inventory, Android results and changed-file list are historical, not actions repeated in the current checkpoint. All external instructions are subject to the approval gates above.

Updated: 2026-11-01 (America/Chicago). **B4.2: BLOCKED / incomplete.** Local preparation and bounded emulator checks are complete. **iOS: NOT VERIFIED. Android: PARTIAL (emulator only).** No physical-device acceptance or store readiness is claimed.

## Configuration and changes

- Node **24.22.1**, pnpm **12.3.4**. Existing Expo **57.0.26**, React Native **0.86.3**, app version **1.0.0**, scheme `loadpacket`, and both identifiers `com.loadpacket.driver` retained.
- Existing EAS project retained: `@thuofred1/loadpacket-driver`, ID `24843f19-db3f-44b3-b6b5-250ba4f1d433`. Cached EAS CLI 24.8.0 is authenticated. This does not establish Apple team/signing access.
- `apps/mobile/eas.json`: development remains internal distribution with a development client; now explicitly selects the development environment, Node 24.22.1, pnpm 12.3.4 and a physical iOS target (`simulator: false`). Preview/production profiles unchanged. Both development profiles pass the installed EAS schema validator. [EAS configuration reference](https://docs.expo.dev/eas/json/).
- New root `.easignore` preserves required source/manifests and excludes environment files, signing credentials, generated native directories, dependencies/build output, test databases/evidence, local storage and root paperwork exports. Validated with the installed EAS ignore engine: eight sensitive/generated exclusions and seven required inputs. No archive was uploaded. EAS uses this file instead of nested Git ignore files, so future exclusions must be maintained here too. [Expo archive rules](https://docs.expo.dev/build-reference/easignore/).
- Fixed an observed native bug: login title overlapped Android system status icons. Headerless login and access-denied screens now use the existing safe-area dependency. Before/after screenshots and the login title's native bounds verify the login fix. The access-denied variant still needs on-device visual acceptance. No auth/domain rule changed.

Resolved native config contains camera/photo-library and foreground-location purpose strings, SecureStore and Router plugins, and dev-launcher local-network/Bonjour entries. Background location modes are not enabled; Android audio/background-location permissions are removed. File picker, image picker, WebView/signature, safe-area and native purchase dependencies already exist. This is config/plugin resolution, not proof of a newly compiled manifest or OS permission behavior.

## Installed-build evidence and actual results

### iPhone — NOT VERIFIED

User confirms a physical iPhone is available but no LoadPacket development build is installed. This is a Windows workstation; no Xcode build/simulator was run. Apple membership/team, device registration, signing certificate and provisioning profile remain unverified. No iOS development build appeared in the read-only EAS development-build query. No cloud build, signing mutation or submission was started.

All physical iPhone checks remain **NOT VERIFIED**: launch/login, invitation/recovery, SecureStore restoration, assigned loads, accept/start/stop/completion, camera/file BOL/POD capture, permission denial, interruptions/retries, stale assignment/revocation, logout/session expiration, keyboard/safe areas and accessibility.

### Android — PARTIAL

Existing `Pixel_8` AVD, Android 35 x86_64, WHPX available. Booted read-only, headless, without SDK downloads or saving a snapshot. An existing `com.loadpacket.driver` development client was already installed: version **1.0.0**, versionCode **1**, minSdk **24**, targetSdk **36**, last update **2026-10-01**. Launcher reported runtime `exposdk:57.0.0` and ran the current workspace JavaScript.

Separately, EAS returned one finished Android development build: **69384948-a152-42c4-a7da-a249801b8bcf**, created **2026-10-01T07:54:29Z**. Its artifact was not downloaded; the installed APK was not cryptographically matched to that EAS record. No new binary was built or installed.

**Observed PASS on this installed emulator client:** native launch, editable email/password using the native keyboard, synthetic sign-in, My Loads empty state, Account navigation, session restoration after force-stop/relaunch, logout, login after signed-out force-stop/relaunch, recovery fallback when no web origin is configured, and corrected login safe-area placement.

Boundary: reused `apps/web/test/auth-fixture.mjs` on localhost with fictional credentials, a synthetic public key and empty RevenueCat keys. Both identity and empty-load API responses are fixture responses, not the actual operational backend. No configured remote API, real Supabase account or customer data was contacted. No purchase was attempted. The existing app was launched directly into local Metro; `.env.local` loading was disabled.

**NOT VERIFIED on native Android:** invitation activation/email, real backend integration, non-empty loads/details, lifecycle/stop mutations, native camera/file upload, OS permissions/GPS denial, interrupted uploads/offline retry, stale generation/revoked access, session expiration, screen-reader behavior and physical Android hardware. Existing logic tests do not replace these checks. Full journeys need a confirmed non-production environment and synthetic account/load fixtures.

## Focused checks

- **22 mobile tests PASS** selected for auth/session, requests, assignment/access, files/capture, location, retry/readiness and related existing isolation guards. Some imported Pro/signature safety cases also matched; no provider was activated.
- Mobile typecheck and mobile lint **PASS**; final typecheck and changed-area lint **PASS** after safe-area fixes.
- Final iOS and Android JS/Hermes exports **PASS**, with synthetic `.invalid` origins, local dotenv disabled and paid SDK keys blank. These are bundles, not signed IPA/APK files.
- Expo config introspection **PASS**. EAS schema/profile and upload-ignore checks **PASS**. `git diff --check` and explicit changed-file whitespace/conflict checks **PASS**.
- **Online `expo install --check`: FAIL** (exit 1). Current recommended patches: `expo ~57.0.31`, `expo-constants ~57.0.22`, `expo-dev-client ~57.0.20`, `expo-linking ~57.0.13`, `expo-location ~57.0.22`, `expo-router ~57.0.29`. Installed versions respectively: 57.0.26, 57.0.20, 57.0.19, 57.0.11, 57.0.20, 57.0.24. No dependency or lockfile was changed. This recommendation alone does not prove a native compile failure, but the compatibility gate is not green. Resolve with a focused patch review before requesting a new build; do not run a broad upgrade or suppress the check.
- Non-fatal development warnings: Supabase `processLock` deprecation and offline manifest-asset lookup warnings. No lock/auth redesign or font changes were made.

Repeat targeted commands from repository root with Node 24 on PATH:

```powershell
pnpm --config.verify-deps-before-run=false --filter mobile exec tsx --test --test-name-pattern='session|sign-out|driver|Driver|401|request|upload|file|location|deadline|revoked|forbidden|offline|refresh|capture|recovery|generation|blur' test/mobile.test.ts
pnpm --config.verify-deps-before-run=false --filter mobile typecheck
pnpm --config.verify-deps-before-run=false --filter mobile exec eslint app/login.tsx 'app/(driver)/_layout.tsx'
$env:EXPO_NO_DOTENV='1'
pnpm --config.verify-deps-before-run=false --filter mobile exec expo install --check
git diff --check
```

Evidence retained under ignored `test-results/b42-mobile/`: sanitized EAS build inventory, resolved Expo config, final export metadata/bundles, emulator logs, login before/after screenshots, and XML assertions for restored session, recovery and logged-out restart. No authentication token or signing credential is part of this report.

## Exact Windows → iPhone steps for the user

### 1. Confirm prerequisites before a cloud job

Confirm the intended Apple Developer team has an active membership and permission to manage this app's signing. If enrollment or any new payment is required, stop for separate spending approval. Check the Expo account's included build allowance before starting EAS; do not enable paid overages or upgrade a plan automatically. Signing and device actions below are user-executed, not actions already performed by Codex.

Confirm the approved **non-production** API and web origins and a synthetic Driver account. The local mobile file has API/Supabase public values, but their development status was not confirmed; no values were displayed. `EXPO_PUBLIC_WEB_URL` is absent locally, so native recovery currently falls back to carrier instructions. Do not use a localhost API URL on the physical phone or assume the currently configured remote API is safe test infrastructure.

In the existing Expo project, configure the **development** environment with these approved public client values:

- `EXPO_PUBLIC_API_URL`: phone-reachable test HTTPS API ending `/api/v1`.
- `EXPO_PUBLIC_WEB_URL`: test HTTPS web origin only, for the existing invitation/recovery flow.
- `EXPO_PUBLIC_SUPABASE_URL`: the matching test identity project's URL.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable client key only.

Never put database credentials, service-role/server keys or Apple credentials in `EXPO_PUBLIC_*`. Leave RevenueCat keys unset for this core Driver acceptance; Pro is not required. Review both project and account-level EAS variables for unintended inherited paid-provider values. EAS development variables and the local Metro environment are separate; the latter serves the JavaScript used by a development client. [Environment selection](https://docs.expo.dev/eas/environment-variables/usage/).

### 2. Use the already-installed tools

Run PowerShell:

```powershell
Set-Location 'C:\Users\User\Documents\loadpacket\apps\mobile'
$env:PATH='C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;'+$env:PATH
$eas='C:\Users\User\AppData\Local\npm-cache\_npx\cdcf29a1293ceb8d\node_modules\eas-cli\bin\run'
if (!(Test-Path -LiteralPath $eas)) { throw 'Cached EAS CLI missing; stop and restore the approved CLI installation.' }
node --version
$env:EXPO_NO_DOTENV='1'
node $eas whoami
node $eas project:info
```

Confirm `thuofred1/loadpacket-driver` and the project ID above. Do not create another project or change identifiers. Run EAS commands from `apps/mobile`, as required for the monorepo. [Expo monorepo setup](https://docs.expo.dev/build-reference/build-with-monorepos/).

### 3. Register the iPhone and resolve signing

```powershell
node $eas device:create
```

Choose the intended existing Expo account and Apple team. Enter Apple ID/2FA only in the trusted CLI/Apple prompts, never in chat. Choose website registration and open the generated registration link in Safari **on the iPhone**. Follow the configuration-profile/device-registration prompts, then confirm that this phone is registered. Registration is not installation of LoadPacket.

After resolving the compatibility check and confirming the environment/signing/build allowance, initiate the development build yourself:

```powershell
node $eas build --platform ios --profile development
```

Select the registered iPhone for the ad hoc provisioning profile. Reuse valid existing signing credentials when offered; create only the required app/profile credentials for `com.loadpacket.driver` under the intended team. Do not revoke shared certificates to bypass a signing failure. Stop on unresolved team access, payment prompts, identifier ownership conflicts or device limits. Do not add `--auto-submit`, run `eas submit`, use the production profile or create an App Store Connect submission. [Expo physical-iOS development-build guide](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/).

### 4. Install and connect to Metro

After the job finishes, open its EAS installation link/QR in Safari on the registered iPhone and install the development client. Record the EAS build ID, app/build version, iPhone model and iOS version. If installation is refused, first verify that this phone's UDID is included in that build's profile; registering a phone after the build does not amend an existing IPA.

On iOS 16+, enable **Settings → Privacy & Security → Developer Mode**, restart and confirm. The setting may appear only after installing/attempting to launch the development app. [Developer Mode instructions](https://docs.expo.dev/guides/ios-developer-mode/).

For Metro, use a new PowerShell window with Node 24 and the same `apps/mobile` directory. Set only approved public test configuration in that process; the prompts below avoid committing values or relying on the existing file:

```powershell
$env:EXPO_NO_DOTENV='1'
$env:EXPO_PUBLIC_API_URL=Read-Host 'Approved HTTPS TEST API URL ending /api/v1'
$env:EXPO_PUBLIC_WEB_URL=Read-Host 'Approved HTTPS TEST web origin'
$env:EXPO_PUBLIC_SUPABASE_URL=Read-Host 'Approved TEST Supabase URL'
$env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=Read-Host 'TEST publishable client key, never a server key'
$env:EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=''
$env:EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=''
Remove-Item Env:EXPO_OFFLINE -ErrorAction SilentlyContinue
Remove-Item Env:REACT_NATIVE_PACKAGER_HOSTNAME -ErrorAction SilentlyContinue
pnpm --config.verify-deps-before-run=false exec expo start --dev-client --lan
```

Keep the PC and iPhone on the same trusted Wi-Fi. Scan Metro's QR code with the phone camera, open it in **LoadPacket Driver**, and allow Local Network access. Keep Metro running. If Windows asks about firewall access, review and allow only the intended private development network yourself; no firewall changes were made here. If Wi-Fi client isolation prevents connection, stop and diagnose the network rather than exposing a production service or enabling a paid tunnel. Expo Go does not qualify this native client.

### 5. Record the physical acceptance results

Use a fictional carrier/Driver and synthetic documents; have an authorized test Owner available in the matching web environment.

1. Complete a new invitation and password recovery through their existing web/email flows on the phone, then log in natively. Verify validation, keyboard, password visibility and error feedback.
2. Force-close/reopen: session restores. Check assigned-only listing and pickup/delivery details. Another Driver/tenant must not become visible.
3. Before accepting a booked assignment, have the Owner unassign/reassign it to the same Driver. Submit the old screen's action: it must be rejected and require refresh; the fresh assignment must work.
4. Accept/start; record arrival/departure for pickup and delivery in order. Rapidly repeat a command: there must be one server event. Deny location once: manual recording must not fabricate GPS.
5. Confirm completion is blocked without required BOL/POD. Deny camera once and recover via file picker; then capture a synthetic BOL with camera and upload a synthetic POD PDF from Files. Check cancellation, unsupported/oversize files, received/rejected states and successful completion.
6. Interrupt a request/upload with Airplane Mode. The app must not claim rollback/success without confirmation or replay silently. Reconnect, refresh server state first, and retry only when appropriate; no duplicate evidence. Restart during an upload, then reconcile with the server and reselect only if still missing.
7. Have the Owner revoke the synthetic Driver's access. Refresh/foreground/action must deny access; previously cached work must not permit a mutation. Restore the fixture only through authorized test administration.
8. Log out, force-close/reopen and confirm login. Exercise expired session/refresh with test identity administration. Check large text, VoiceOver focus/labels, keyboard reachability, safe areas and permission prompts.

For each item record PASS/FAIL/NOT VERIFIED, build/device identity, observed result and redacted screenshots. Do not send passwords, tokens, signing profiles or private documents. B4.2 is complete only after this evidence and the remaining Android native journeys are recorded.

## Android continuation and cleanup

No Android SDK setup is needed to boot the existing AVD. Full native acceptance needs the approved test environment above. After compatibility review, use an existing compatible development APK or a separately approved development build; no large SDK installation or system change was performed. Windows currently has SDK platform `android-37.0`, build-tools `36.0.0`, Java 11 on the default PATH and Android Studio JBR 25; a fresh local Gradle build/toolchain is **not qualified**.

For the existing emulator, start `emulator.exe -avd Pixel_8` from `C:\Users\User\AppData\Local\Android\Sdk\emulator`, run Metro with the approved test settings, and use the development client. If host access is needed, `adb reverse tcp:8081 tcp:8081` maps Metro only; it does not supply an API or identity provider. The earlier IPv6-only localhost issue was resolved by the task's IPv4-capable Metro process, not by changing system networking.

Task-created Metro, synthetic provider and read-only emulator were stopped; task forwarding removed. Original emulator snapshot/app installation and local environment files were preserved. Ignored synthetic evidence was retained. No production access, database operation, migration, paid-provider activation, dependency upgrade, cloud job, signing mutation, store submission, commit or push occurred.

Changed files: `.easignore`, `apps/mobile/eas.json`, `apps/mobile/app/login.tsx`, `apps/mobile/app/(driver)/_layout.tsx`, and this report. No B4.1 rerun, organization billing, B5, AI or Voice work.

**Next action:** confirm the non-production API/web/Supabase environment and synthetic account, resolve the six-package Expo patch compatibility gate, then complete Apple signing/device registration and build/install using the steps above. Physical iPhone results remain NOT VERIFIED until the user runs the installed app.
