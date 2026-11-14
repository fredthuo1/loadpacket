# Production security design

Status: PROPOSED hardening; existing controls and unknowns are in [audit](current-state-audit.md). No secrets were inspected, rotated or changed.

## Trust boundaries

Public clients/edge are untrusted; authenticate at API on every operation. WAF/body limits/rate controls precede expensive parsing. Origin accepts only trusted edge traffic through authenticated origin/private networking as supported, while API never trusts arbitrary forwarded IP headers. TLS end to end with certificate verification; private DB/storage endpoints or strict egress/ingress allowlists. Separate runtime, migration, operator, scanner, backup and support roles. Exact HTTPS CORS is not authentication.

Rate limits combine IP, verified tenant/user, operation and byte budgets; do not rely solely on shared NAT IP. Initial thresholds are measured in staging to avoid blocking fleets. Return 429/Retry-After with no duplicate writes. Apply stricter unauthenticated broker/grant/login and invitation limits; count rejected upload bytes and parser concurrency. Per-tenant fair scheduling prevents a large import starving dispatch.

## Secrets and environments

LOCAL, DEV, STAGING and PRODUCTION have separate databases, stores, identities, auth projects, email and billing credentials. Never clone customer data or production secrets to lower environments. Recovery drills using real encrypted backups are production-security-class isolated environments, with no outbound email/billing and explicit approval; routine tests use synthetic fixtures.

Server-only: database credentials, Supabase administrative secret, private-download signing material, future webhook secrets, storage credentials and encryption-key authority. Client-public: NEXT_PUBLIC/EXPO_PUBLIC API origins and publishable SDK keys only. RevenueCat `test_` remains native `__DEV__`-only. Secret values must not enter images, logs, Terraform outputs/state without encryption/access control, screenshots or support tickets. OIDC/short-lived workload identities preferred over long-lived cloud keys.

Ownership: platform SRE owns runtime/network keys; identity administrator owns Supabase; billing owner owns provider credentials; recovery custodian owns backup decryption; security reviews grants and rotation. Rotation uses dual verification where supported, canary consumers, bounded overlap, revoked old credentials and audited completion. Do not rotate sole backup keys without proving old backup readability. Follow [rotation runbook](../runbooks/credential-rotation.md); no rotation is executed here.

## Evidence security

Follow [upload quarantine](object-storage.md): MIME/magic/size, checksum, malware and parser sandbox, encryption, versioned access. Original evidence cannot be replaced by processed output. Access is logged as metadata only, with minimum retention and consent policy. Separate sensitive Driver documents from ordinary load paperwork in authorization and support projections.

Append-oriented audit spans critical business changes and privileged operations; production roles cannot rewrite history. All logs redact Authorization, cookies, refresh tokens, provider keys, signed query strings, grant path segments, body/document bytes, names/emails and financial descriptions unless a specifically approved protected audit field. Correlation IDs must be random, length limited and not derived from customer data.

## Support and incident access

Support initially receives organization/user/load identifiers only through a scoped support view, app/build version, request IDs, redacted errors and status. Access requires tenant scope, ticket/reason, time-bounded capability, MFA and audit. No unrestricted SQL console, bucket browsing or unlogged impersonation. Sensitive document viewing requires separate owner/security approval, purpose and access record; emergency break-glass uses two-person authorization and expiry. Add redacted diagnostics export before broad admin UI.

## Finance and integrations

Exact decimal/currency/provenance and linked corrections remain mandatory. Payroll/tax are preparation; no bank movement, tax advice, filing or full general ledger is authorized. Monetary status changes need idempotency and audited actor authority. Protect imports from spreadsheet formula injection on export and dangerous parser inputs. Organization billing stays behind a future server adapter; its outage cannot block logistics. Auth/RevenueCat/email cannot override tenant authority or grant Pro on failure.

Threat review must cover cross-tenant IDOR, replay, malicious uploads, operator deletion, leaked grants, support abuse, supply chain, unavailable auth, stolen runtime identity and ransomware. External pen-test/security sign-off and key/backup recovery are P0 evidence, not implied by passing unit tests.
