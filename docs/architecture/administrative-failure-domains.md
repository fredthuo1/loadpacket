# Administrative failure domains — LP-PROD-001

As of 2026-10-01; repository-only. **No provider ownership, MFA or recovery status was inspected.** Source dependencies below are verified repository facts; compromise impacts are conditional threat analysis, not claims that a shared administrator actually exists.

## Service-by-service evidence

- **GitHub / GHCR:** CONFIG: Docker artifacts and a prior requested GHCR deployment model exist. This checkout has no configured Git remote name and no GitHub workflow. Live source/registry organization, repository, publishers, token scopes, branch protection, owners, MFA, recovery and registry backup are UNKNOWN. If a publisher can replace trusted images, web/API behavior and credential exposure could both be affected. Source and registry may or may not share administration.
- **Render:** HISTORICAL_EVIDENCE: user-reported web/API hosting. Current workspace/team owners, service configuration writers, billing owners, MFA/recovery, regions/disks and backups are UNKNOWN. If the same principal controls both services and the document disk, image/config compromise could affect both serving and evidence. This common principal is not verified.
- **Database provider:** SOURCE: server PostgreSQL connection; provider account unknown. Runtime, migration, database owner, project admin and backup/key administrators are UNKNOWN. DB administrative compromise could change data, grants, recovery points or delete history; independent backup recovery must be proven.
- **Supabase:** SOURCE: identity verification, client sessions and server invitation administration. Project owner/organization, Auth admin permissions, MFA, recovery, SMTP and backup authority UNKNOWN. Identity and DB may historically share Supabase, but the current project/account linkage is unverified. Auth account compromise could prevent login or manipulate identities; application User/tenant mappings remain a separate authorization boundary.
- **Expo/EAS:** CONFIG: owner `thuofred1` and project ID in [app.json](../../apps/mobile/app.json). This string does not prove current sole ownership, access or MFA. Team roles, build-secret writers, signing permissions, account recovery and credential backup UNKNOWN. A malicious build/config publisher could redirect mobile traffic or distribute altered client code.
- **Apple:** CONFIG: `com.loadpacket.driver` iOS identifier only. Developer team, account holder, App Store Connect roles, MFA, signing custody, recovery and transfer/renewal continuity UNKNOWN. Release/revocation authority can affect distribution; it is not a DB administrator unless further evidence shows linkage.
- **RevenueCat:** SOURCE: mobile SDK/entitlement dependency. Project/team owners, store credential custody, API roles, MFA/recovery and backup/export options UNKNOWN. Compromise could change offerings/entitlements; current free logistics should remain independent of the paid Finder entitlement. There is no server subscription datastore to claim is backed up.
- **Email:** SOURCE: Supabase invitation integration. Actual SMTP vendor, sending domain owner, admin roster, MFA/recovery and delivery retention UNKNOWN. Mailbox takeover could affect invitations and account recovery. Do not infer that the operator's personal email is the shared recovery root.
- **DNS/domain:** HISTORICAL_EVIDENCE: Render subdomain URL model. Custom domain, registrar, DNS provider, owners, DNSSEC, MFA and recovery UNKNOWN. DNS/registrar control would redirect a custom hostname if one exists; one current DNS account cannot be asserted from repository evidence.

## Blast-radius map

Verified dependency edges (SOURCE unless marked historical):

```text
Web/mobile -> Supabase Auth -> API identity-to-User/tenant mapping
Web/mobile -> API -> PostgreSQL connection
                    -> LocalDocumentStorage root
API invitation -> Supabase identity administration -> email delivery (vendor unknown)
Mobile -> RevenueCat SDK -> store purchase/entitlement system
EAS config -> mobile build identity; Apple config -> iOS application identifier
Render web/API hosting (historical) -> deployed image/DB/disk relationships unknown
GitHub/GHCR/DNS administrator and recovery edges -> UNKNOWN
```

No cross-provider shared-account edge is VERIFIED_PROVIDER_READ_ONLY. Backup administration sharing is UNKNOWN for DB, filesystem, keys, source and configuration. Therefore the map establishes dependencies but cannot certify independent recovery authority.

## Closure and later controls

Security/platform leads must be named by the owner. Collect non-secret account/team IDs, role descriptions/counts, dated MFA/SSO enforcement attestation, two recovery custodians where feasible, recovery-channel dependencies, break-glass procedure and backup/key account separation. Do not collect passwords, seed phrases, MFA seeds, recovery codes or API keys in this repository.

Build a principal-to-action matrix: deploy/configure; read/write data; migrate/drop; delete disk/backup; decrypt backup; change DNS; change identity/signing/billing; recover another account. Correlated blast radius exists only where this matrix proves an overlap. Require separate backup deletion authority and recoverable key custody; rehearse recovery later in isolation. This ticket changes no memberships, MFA, credentials or policies.
