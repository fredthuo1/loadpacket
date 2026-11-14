# LP-IOS-ACCEPT-01 — Physical iPhone Build Preparation

Status: BLOCKED_EXTERNAL — September 29, 2026.

## Verified locally

- Node and pnpm Node: v24.19.0.
- LP-DOC-SIGN-01 source present; signature canvas 5.1.1 and WebView 13.16.1 declared.
- Mobile typecheck, lint, all 30 tests and Expo dependency compatibility PASS on this run. The full release gate was not repeated.
- Configured development/test Prisma status: 17 migrations current, including `20260928090000_document_signatures`. Read-only status check only; no database mutation.
- Bundle `com.loadpacket.driver`, version `1.0.0`, local initial build number `1`. Preview is internal distribution; version source is remote, so an actual EAS build number is not yet known.
- No EAS project ID or owner is bound in app.json. No development/preview mobile environment file or process public variables are present. The only configured API origin found is `http://localhost:3001/api/v1`, which cannot be used as the iPhone API.

## EAS access

`pnpm dlx eas-cli` downloaded 24.8.0 but exited before running the CLI because dependency build scripts were not approved. No repository dependency or approval configuration was changed. Temporary `npm exec --yes --ignore-scripts --package=eas-cli@24.8.0 -- eas ...` successfully ran the same CLI with install scripts disabled.

`whoami`: Not logged in. `project:info`: authentication required. Browser login was opened using `eas login --browser`; user sign-in is pending. No credentials, access tokens or public SDK key values are recorded here. [Expo CLI authentication reference](https://docs.expo.dev/eas/cli/).

## Required before build

1. Complete the browser Expo login and identify the correct existing LoadPacket account/project. Inspect existing projects before binding; never create a duplicate automatically.
2. Supply/verify an approved iPhone-reachable HTTPS development/test API ending `/api/v1`. No endpoint was invented and no infrastructure deployment is authorized by this task.
3. Inspect the selected project's preview environment for the API, Supabase public config, Apple RevenueCat `appl_` public SDK key and exact entitlement. Configure only validated public client values; remote presence remains unverified while signed out.
4. Register Fredrick's iPhone and verify the intended Apple team/certificate/profile. Device and signing status are currently unverified; no registration or signing changes occurred.
5. Inspect the build upload inputs for secrets/unrelated private documents, then build internal preview without auto-submit. No build has started or consumed a build job yet.
6. Install on the registered device and observe launch/login/My Loads/signature pad/Clear/Cancel and Pro initialization. All physical checks are NOT_RUN, not presumed failures or successes.

## Scope preserved

Application source, app/EAS configuration and dependency manifests unchanged. No database write, production change, infrastructure deployment, Apple/RevenueCat configuration change, purchase, store submission, commit or push. No full native acceptance or submission readiness claimed.

Next action: finish pending Expo browser authentication and resolve the existing-project/API URL questions before any build or signing operation. The user has already authorized the bounded internal-preview build workflow; no repeat permission request is needed once prerequisites are concrete.
