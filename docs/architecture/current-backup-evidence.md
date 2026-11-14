# Current backup evidence — LP-PROD-001

Evidence date: 2026-10-01. **Repository-only audit. No provider or restore operation performed.** Status is scoped: VERIFIED_ENABLED / VERIFIED_DISABLED / UNKNOWN. Absence of a backup script proves only that repository automation was not found; it does not prove provider backups are disabled.

## Database

**UNKNOWN (UNKNOWN_REQUIRES_PROVIDER_ACCESS):** automated backup enablement, successful last backup, retention, PITR window/WAL continuity, snapshot schedule, restore point availability, region, storage account, key custody, immutability, deletion protection, owner/support escalation and measured restoration time. No fresh catalog/API/export evidence is present.

**SOURCE/CONFIG:** [Prisma configuration](../../apps/api/prisma.config.ts) and [17 migrations](../../apps/api/prisma/migrations) reproduce schema history, not customer records. [Deployment guidance](../production/deployment.md) describes operator responsibilities. [Backup design](backup-and-recovery.md) and [restore runbook](../runbooks/database-restore.md) are proposals, not executed restores. Their 35-day PITR/retention proposals must not be reported as enabled.

**HISTORICAL_EVIDENCE:** earlier isolated regression/migration-preservation reports are development checks, not proof of a current production backup or successful disaster recovery.

Required future read-only evidence: provider/project identifier, retention/earliest-latest restore timestamps, recent successful job/snapshot metadata, region/account separation, policy protection, encryption-key recovery authority, redacted restore report with independently checked row/Decimal/tenant/schema consistency. Do not retrieve customer payloads or connection credentials for this inventory. A real restore experiment requires its own isolated authorized ticket.

## Documents and signatures

**SOURCE:** [local adapter](../../apps/api/src/documents/document-storage.ts) writes a single configured filesystem destination. Its application-level dual-region receipt capability is **VERIFIED_DISABLED** in the narrow sense that no such implementation exists; underlying provider replication is **UNKNOWN**. Production mount presence itself is unknown. Exclusive create and SHA-256 do not constitute a backup.

**UNKNOWN:** persistent disk backup/snapshot enablement, latest successful snapshot, crash/application consistency, retention, schedule, region, independent account, immutable retention, restore procedure actually used, deleted-version recovery and key availability. No provider default is treated as configured. No application backup scheduler or executed document-restore report was found.

RateCons, BOL/POD, vault files, invoice PDFs and signature PNGs require both SQL references and matching bytes. Finance import originals are stored as DB Bytes and therefore belong to the DB backup scope. A future restore must reconcile every DocumentVersion and DocumentSignature storage key/checksum, missing objects, unreferenced staged evidence and revocation/tenant permissions at a consistent boundary. Preserve uncertain artifacts until reconciliation; do not guess that unreferenced means disposable.

Required evidence: actual disk/mount mapping; backup policy plus successful job metadata; restored manifest containing synthetic/approved IDs, byte counts and SHA-256; exact SQL snapshot/restore boundary; missing/mismatched count zero; deletion recovery proof; independent backup administrator/key test. See [object recovery runbook](../runbooks/object-storage-recovery.md).

## Configuration and IaC

**CONFIG, VERIFIED_REPOSITORY:** Dockerfiles, lockfile, source, schema migrations, public variable names, EAS identifiers/profiles and deployment instructions are present. Git workspace is extensively dirty/untracked and has no configured remote name at inspection; local files alone do not establish a recoverable remote source backup.

**UNKNOWN:** reproducibility of the deployed image, registry retention, repository remote backup, protected release tags, environment/secret recovery, Render services/disks, Supabase callbacks/email/policies, EAS/Apple credentials, RevenueCat products, DNS and provider IAM. No implemented Terraform or GitHub workflow was found. These settings may exist in provider UIs, but even that location is not verified.

The backup closure checklist must cover source/artifact digest, approved configuration manifest, secret-manager recovery references (never values), IaC state backup if later adopted, provider contact/recovery access and keys in a separate administration domain. A replica and a same-account snapshot do not alone protect against destructive administrator access.

## Decision

No production backup protection is marked VERIFIED_ENABLED or VERIFIED_DISABLED. All provider settings remain UNKNOWN. Backup, restore and independent recovery gates stay NOT_VERIFIED. The safe next step is an owner-supplied redacted evidence package; the future [database](database-poc-plan.md) and [object](object-storage-poc-plan.md) POCs test synthetic recovery independently of current production.
