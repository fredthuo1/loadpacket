# LoadPacket release readiness — September 23, 2026

Status: IMPLEMENTATION_COMPLETE_EXTERNAL_CONFIGURATION_REQUIRED. No store submission, deployment, live email or purchase was performed.

## Native identity and versioning

Both platforms retain `com.loadpacket.driver`; display name LoadPacket Driver; scheme `loadpacket`; app version `1.0.0`; iOS buildNumber `1`; Android versionCode `1`. Confirm legal ownership and exact matching store/RevenueCat/EAS app records before signing. EAS uses remote build versions with production auto-increment; initialize the remote counters once from these values, and do not bump marketing version for each local test. Development and preview remain internal builds. The existing native configuration passes Expo checks; signed builds and physical-device behavior remain unverified.

The repository targets Node >=22.13.0; use Node 24 consistently for shell, package-manager scripts, CI, API and Expo. Check both `node --version` and `pnpm exec node --version`: this host's tools have previously emitted Node 20 compatibility warnings from nested test processes. Do not interpret that warning as verification of a supported deployed runtime.

RevenueCat Test Store (`test_` SDK keys) is supported only in native development/debug builds, gated by `__DEV__`; public environment variables cannot enable it in a release build. Production Android requires a `goog_` public SDK key and production iOS requires an `appl_` public SDK key. Expo Go remains unsupported. Test Store validation is not evidence of a Google Play/App Store transaction. Acceptance requires an actual native debug build to load the configured offering and complete a Test Store purchase.

## Data and permissions inventory (store form preparation, not a legal policy)

- Authentication: Supabase identity, email, session/access/refresh credentials; native persistence uses SecureStore. The API maps identity to carrier, role and Driver.
- Operations: assignments, load state, stop arrival/departure timestamps, document statuses and audit events. Drivers see only assigned-load projections.
- Location: optional coordinates/accuracy/device time attached to Driver-confirmed stop events. Foreground permission only; 12-second lookup timeout; denied/unavailable location has a manual confirmation path. No continuous tracking, background location, geofence, contacts, Bluetooth or microphone use.
- Documents/photos: carrier paperwork from camera/gallery/files; immutable private evidence and versions. Camera/photo explanations are configured. Android audio recording/background location are blocked. Verify the final signed manifest/Info.plist before submission, including transitive permissions.
- Purchases: RevenueCat receives the stable application User.id, store transaction/customer/entitlement information. Public SDK keys belong in the app; secret REST keys belong only on servers. Driver operational work is not paywalled.
- Broker sharing: anyone holding a generated bearer link can see the explicit load permissions and selected document types until expiration/revocation. No Driver contact data, internal financial review, payment ledger, raw agreement terms or internal IDs are projected. Document grants last at most 60 seconds and require a currently valid share token on every download.

The operator must verify provider processing, retention, deletion/account support, privacy disclosures and applicable store forms against the actual production deployment. No claim of regulatory compliance is made by these notes.

## External submission blockers

- Approved public Privacy Policy, Terms and Support URLs/content have not been supplied. Do not invent URLs or submit placeholder policies.
- Final 1024×1024 icon, launch/splash artwork and platform/device screenshots are not supplied. Configure final assets in Expo before submission; take screenshots from the signed accepted build, using current store-specific device requirements. No marketing assets were generated in this sprint.
- Configure EAS project ownership, Apple/Google accounts, signing/provisioning, store records/test tracks, matching bundle/package IDs and sandbox testers. No build/signing credentials are in source.
- RevenueCat: platform public SDK keys, `pro` (or configured entitlement), actual store products/current Offering/packages, store agreements and sandbox purchase/restore verification. Expo Go mock/preview behavior does not count as purchase acceptance.
- Supabase: public URL/publishable keys in web/mobile; server secret only in API; configured web URL and allowed invitation/recovery callback URLs; custom SMTP and real invitation/email acceptance. Do not copy server credentials into public build variables.
- API: production HTTPS origin, exact CORS origins (including public web origin), X-Broker-Token allowed header, database migrations, server-only download secret >=32 characters, and edge request throttling. Do not enable request-header/body logging for credentials. Broker tokens travel via URL fragment then header, never a server URL parameter. The public web route sets no-store/no-referrer/noindex and removes its fragment after loading.

## Storage: PRODUCTION_STORAGE_CONFIGURATION_REQUIRED

LP-PROD-01 preserves filesystem storage and its existing database keys. Local development defaults to `storage/documents/...` under the API working directory. Production now requires absolute `DOCUMENT_STORAGE_ROOT`, normally `/data/loadpacket/documents`, on a durable private volume. Startup checks directory permissions without writing probe documents or clearing storage. Use one API replica for the hackathon, retain the volume on redeployment, configure database/volume backups and verify checksum-preserving retrieval after restart. Ephemeral disks are not sufficient. Object storage and horizontal scaling are post-hackathon work, not this release's requirement. See [deployment instructions](production/deployment.md) and the [first-deployment checklist](production/first-deployment-checklist.md). No volume or backups have been provisioned by this ticket.

## Acceptance

Run the automated full gate and the live/manual scenarios in `regression-scenario-matrix.md`. A passing JavaScript/Hermes export does not prove native installation, camera permissions, location capture, SMTP delivery or real store transactions. Publishing remains an explicit operator action after those checks.
