# Day 7C — Business Document Vault

Implementation complete. One additive migration, `20260920031500_add_business_document_vault`, applied successfully. All original business rows and columns matched pre-migration fingerprints, including existing users and driver mappings.

Company and driver context links reuse Document and immutable DocumentVersion. Each new upload records checksum, uploader, dates and a tenant-scoped retry key. Corrections create new versions. Local storage uses exclusive writes behind DocumentStorage; committed files are retained if a response fails. Existing rate confirmation and driver capture uploads now use this adapter and record the uploader.

Owner manages company/driver records. Dispatcher and Back Office can read company/load records. Driver can read only their own driver records. Legacy metadata/extraction routes cannot bypass sensitive-driver restrictions. Publicly reachable download URLs require a signed 60-second grant and recheck current account and document permissions on use. API responses never expose storage paths through the vault.

Routes: GET /documents/vault, GET /documents/vault/:id, POST /documents/vault/:id/versions, POST /documents/vault/:id/versions/:versionId/download, GET /documents/vault-files/:ticket, GET/POST /company/documents, GET/POST /drivers/:driverId/documents. All are beneath /api/v1. Web route /documents includes context/type/status/expiration filters, upload, replacement, download and version history.

Checks: Prisma validate/generate, API/web typecheck, lint and builds pass. 50 API unit tests and 153 HTTP tests pass. Two vault browser tests pass; complete browser suite recorded in the progress ledger. Secret audit found zero findings across source and 28 fresh browser bundles.

Production environment must supply a backend-only DOCUMENT_DOWNLOAD_SECRET of at least 32 characters and durable private storage shared by API instances. The current local adapter requires a persistent volume; it is unsuitable for ephemeral deployment disks. Development uses a per-process random signing key. Production fails closed when signing configuration is missing. Live invitation provider acceptance remains separately pending under phase 7B.

Primary files: prisma/schema.prisma and the migration; src/documents/{vault.service.ts,vault.controller.ts,vault.dto.ts,document-storage.ts,document-download.service.ts}; packages/api-contracts/vault.d.ts; web/src/app/documents/page.tsx; API test/vault.e2e-spec.ts, src/documents/vault.spec.ts; web/test/vault.spec.ts; scripts/day7-migration-preservation.cjs.
