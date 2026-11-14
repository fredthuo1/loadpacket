# Customer data lifecycle and support

Status: PROPOSED. Legal/privacy decisions explicitly require qualified counsel; no retention law or deletion deadline is invented.

## Classification

| Class                    | Data                                                                                                                            | Durability / recovery                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 critical/irreplaceable | Loads, original documents and versions, signatures, payments/Finance provenance, audit, required outbox/inbox/idempotency state | Quorum SQL and two-region evidence before ACK; regional RPO 0; immutable independent recovery and full integrity validation                                      |
| 2 important              | Users, Drivers, organization config and identity mappings                                                                       | Same synchronous acknowledgement policy for authoritative changes; losing identity/ownership can make Class 1 unusable. External auth recovery must be qualified |
| 3 reconstructable        | Cache, derived search/analytics, thumbnails, telemetry aggregations                                                             | Rebuildable from Classes 1/2; no sole authoritative state; losing these may degrade speed, never payments/evidence                                               |

Local pending Driver operations are not server-acknowledged Class 1; device loss can lose them until submitted. Extracted text/AI proposals are derived; user-confirmed financial facts become authoritative records with source provenance.

## Lifecycle controls

- Onboarding: verified owner/organization mapping, terms/privacy/support acknowledgement, tenant defaults, role assignment audit and correct region/residency policy. Never link identity by client email alone.
- Organization export: owner-approved asynchronous durable job with consistent snapshot, all versions/signatures/Finance/audit required by agreed scope, checksummed manifest, encrypted private expiring download and access audit. Exclude provider secrets and other tenants.
- User export: verified identity and approved personal-data scope without disclosing another Driver's evidence or organization financial records by default.
- Account closure: confirm authority, distinguish user deactivation from organization closure, revoke sessions/grants, pause jobs/invitations, lock queued device uploads appropriately, offer export and schedule retention review. No cascading deletion as the closure workflow.
- Retention/holds: counsel/product specify documents, personal information, financial provenance, audit and backups independently; holds record authority/reason/date/scope and require audited release. WORM periods cannot be shortened casually; test before locking actual data.
- Deletion: durable owner-authorized request plus legal/privacy review, dependency inventory, export option, hold checks, dual review for irreversible purge and immutable audit of metadata. Execute scoped object-version and DB changes only after policy permits; never erase referenced signature originals first.
- Backups: deletion does not instantly remove immutable backup content. Restrict restored data, carry deletion/hold ledger through restore and reapply approved deletion before customer service reopens. Explain retention implications in the actual privacy policy, subject to counsel.
- Recovery: recover into isolation first, reconcile exact tenant/resource IDs and financial history; prefer audited corrections over overwrite. A single-tenant recovery must not rewind other tenants.

Support uses narrowly scoped diagnostics and time-limited audited access defined in [security](security.md); no unrestricted bucket/SQL access. Customer-visible system status must state degraded submissions without claiming unconfirmed writes were saved. Billing provider outage cannot block POD/upload/access to operational work. DRIVER PRO via RevenueCat and organization SaaS billing remain separate; payroll/tax remain preparation and no new provider integration is authorized.
