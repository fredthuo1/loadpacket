# Database privileges and compatibility inventory — LP-PROD-001

Evidence: SOURCE/CONFIG, 2026-10-01, repository-only. No database session or provider catalog was inspected. Applied production schema, privileges and engine are UNKNOWN. This inventory qualifies the **actual source constructs**, not a generic PostgreSQL CRUD example. [Schema](../../apps/api/prisma/schema.prisma), [migrations](../../apps/api/prisma/migrations), [Prisma service](../../apps/api/src/database/prisma.service.ts) and [package manifest](../../apps/api/package.json) are primary evidence.

## Versions and role boundary

Prisma and generated client: 7.10.0. Adapter dependency: `@prisma/adapter-pg ^7.10.0`; `pg ^8.23.0`; exact resolved packages remain governed by the unchanged lockfile. Generator `prisma-client` outputs `apps/api/src/generated/prisma`; datasource provider `postgresql`; connection uses server-only `DATABASE_URL`. Runtime and Prisma CLI read that variable independently; there is no separate migration-role variable in source. This is **not proof that both processes use the same credential**.

Runtime role name, login/inheritance, memberships, owner/admin/superuser/BYPASSRLS, schema/table/sequence ownership and effective CREATE/ALTER/DROP authority are all **UNKNOWN_REQUIRES_PROVIDER_ACCESS**. The API must insert/update/select rows and execute required lock functions. Source does not demonstrate least privilege, and a schema owner may bypass ordinary RLS. Do not infer an admin role merely because migrations once worked.

Migration operations require schema CREATE and authority to create/alter/drop relevant tables, types, indexes, functions, triggers, views and grants. ALTER/DROP are generally ownership/role-authority questions, not standalone privileges analogous to SELECT. Runtime should not need migration authority. No sequence/autoincrement declarations or CREATE EXTENSION statements were found in the 17 migrations. UUID defaults in Prisma are client-generated; one payment backfill invokes `gen_random_uuid()`. Availability in the selected engine/version must be verified rather than silently installing an extension. Installed provider extensions/sequences may exist outside this source and are UNKNOWN.

## Future authorized catalog evidence, not executed

Use a verified environment and an approved read-only principal. No application connection string is to be read from ambient `.env` for this audit. Save only redacted metadata with date/environment/reviewer. PostgreSQL-specific example below requires adaptation and permission review for another engine. It reads no customer rows or passwords; do not query `pg_authid`, connection strings or arbitrary active query text.

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT current_user, session_user, version();
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin,
       rolinherit, rolbypassrls, rolconnlimit
FROM pg_roles WHERE rolname IN (current_user, session_user);
SELECT parent.rolname AS granted_role, member.rolname AS member_role,
       membership.admin_option
FROM pg_auth_members membership
JOIN pg_roles parent ON parent.oid = membership.roleid
JOIN pg_roles member ON member.oid = membership.member
WHERE member.rolname = current_user;
SELECT nspname, pg_get_userbyid(nspowner) AS owner,
       has_schema_privilege(current_user, oid, 'USAGE') AS can_use,
       has_schema_privilege(current_user, oid, 'CREATE') AS can_create
FROM pg_namespace WHERE nspname = 'public';
SELECT c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity, c.relforcerowsecurity,
       pg_has_role(current_user, c.relowner, 'USAGE') AS owner_role_available
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m');
SELECT table_name, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee=current_user;
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public';
SELECT extname, extversion FROM pg_extension;
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint WHERE connamespace='public'::regnamespace;
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname='public';
SELECT t.tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal;
SELECT current_setting('transaction_isolation') AS session_isolation,
       current_setting('synchronous_commit') AS commit_mode;
SELECT ssl, version, cipher FROM pg_stat_ssl WHERE pid=pg_backend_pid();
ROLLBACK;
```

A catalog owner/membership result needs interpretation including inherited and SET ROLE authority, schema/database CREATE and TEMP, grants through PUBLIC, default ACLs, sequence USAGE/UPDATE, function EXECUTE and view ownership. Repeat effective checks for separately approved runtime and migration identities; never SET ROLE to gain unauthorized access. Read-only inspection cannot prove a destructive operation fails; test CREATE/ALTER/DROP denial only on disposable POC canaries. TLS on this audit connection does not certify the application connection; attest its configuration separately. Read replication/backup status only through an approved redacted provider/catalog view; do not expose replication connection strings.

## Source compatibility classification

Legend: **LIKELY_COMPATIBLE** = source semantics align, still untested; **REQUIRES_POC** = version/topology-specific proof needed; **KNOWN_RISK** = concrete dependency likely to require special handling; **INCOMPATIBLE** = the specifically named unchanged approach cannot satisfy its contract, not a verdict on the entire database product. A/B/C below mean strict synchronous PostgreSQL / CockroachDB / YugabyteDB YSQL. No target versions or vendor tiers are selected. Existing [vendor references and caveats](database-evaluation.md) are background, not TEST or PROVIDER_READ_ONLY evidence.

- **Current Prisma provider/adapter and migration history:** A LIKELY_COMPATIBLE; B INCOMPATIBLE **as an unchanged Prisma PostgreSQL connector/history approach**, needs a reviewed Cockroach connector/native mappings and separate target baseline; C REQUIRES_POC for the pinned Prisma 7.10 adapter path. No dependency or provider edits authorized now.
- **UUID/scalar keys, strings, booleans, integers and enum values:** A LIKELY_COMPATIBLE; B/C REQUIRES_POC. Round-trip all enums, invalid values, UUID defaults/backfill, nullability and max lengths; migration enum ADD VALUE behavior matters.
- **Decimal(12,2) money, Decimal(10,2) miles:** A LIKELY_COMPATIBLE; B/C REQUIRES_POC. Exact scale/range, sums, negative adjustments and serialization must match; no float conversions. HistoricalLoadRecord has no currency column: existing data-model gap independent of engine.
- **DateTime/Date:** A LIKELY_COMPATIBLE; B/C REQUIRES_POC. SQL uses TIMESTAMP(3) without time zone and DATE; test UTC interpretation, date-only boundaries, DST, millisecond truncation, default now(), Prisma @updatedAt and raw SQL timestamps. Do not assume all timestamps are timestamptz.
- **Json/JSONB and Bytes/BYTEA:** A LIKELY_COMPATIBLE; B/C REQUIRES_POC. JSON null versus DB null, arrays, numeric strings, `to_jsonb`, subtraction/IS DISTINCT FROM in Finance trigger and original spreadsheet bytes/5 MiB CHECK must survive. Replicated Bytes amplify storage/backup costs.
- **Single-column PKs, 34 compound uniques and composite FKs:** A LIKELY_COMPATIBLE; B/C REQUIRES_POC. No composite primary IDs exist. Check nullable unique semantics, race errors, cross-tenant rejects, signature's four-column role link and exact-version relation. Preserve explicit constraint-name mapping/truncation from SQL versus Prisma.
- **Indexes, partial/expression uniqueness and normalized identities:** A LIKELY_COMPATIBLE; B/C KNOWN_RISK until exact expression/collation/migration semantics pass. `lower(btrim(...))` historical identifiers and nullable invoice partial index must match application duplicate checks. Race tests, not one insert, establish correctness.
- **Cascade/Restrict/SetNull/NoAction:** A LIKELY_COMPATIBLE; B/C REQUIRES_POC. Test restrictive Finance/signature links and existing organization cascades; no cascade/DELETE relaxation to pass migration. POC must separately expose existing retention gaps.
- **PL/pgSQL, DO blocks, triggers and SQLSTATE translation:** A LIKELY_COMPATIBLE; B/C KNOWN_RISK, pinned version proof required. Functions `protect_financial_amounts`, `prevent_historical_live_duplicate`, `prevent_signature_update`; four associated triggers. Preserve trigger firing and 23505/23514 errors plus Prisma HTTP translation.
- **Advisory transaction locks and hashtextextended:** A LIKELY_COMPATIBLE; B/C KNOWN_RISK. Signatures, vault, Finance/imports and historical/live trigger depend on shared serialization across connections. An accepted/no-op compatibility function is a failure. No ignored-lock flag or test omission is allowed.
- **FOR UPDATE, transactions/upsert/createMany and rollback:** A REQUIRES_POC under remote synchronous latency/failover; B/C KNOWN_RISK for lock/isolation/retry semantics. No isolationLevel override found in runtime services. Never replay external email/file I/O blindly on a serialization retry.
- **RLS/grants, pg_roles and public role names:** A/B/C KNOWN_RISK. Some migrations unconditionally REVOKE from `anon, authenticated`; vanilla fresh clusters lack these Supabase roles. In the disposable POC create inert NOLOGIN compatibility roles as explicit setup before unchanged migration replay; do not grant privileges or edit away revocations. Engine unsupported RLS/role semantics require an equivalent reviewed security design, not a bypass.
- **Raw SQL view/queries and casts:** A LIKELY_COMPATIBLE; B/C REQUIRES_POC. `finance_records` UNION ALL view, exact joins, ::uuid/date/text, interval arithmetic, aggregates, JSON operators, case-insensitive Prisma matches and result aliases need financial fixture comparison. The view is not modeled as a Prisma model.
- **RPO-0 commit/fencing:** A/B/C REQUIRES_POC with actual three-region topology. Local success or wire compatibility is insufficient. Regional HA with only asynchronous remote replication is INCOMPATIBLE with the stated single-region-loss RPO-0 contract.

## Custom SQL and transaction concerns

SOURCE: rate-consistency CHECK, organization load-number duplicate preflight, payment positive-amount/backfill, document date-order CHECK, Finance amount/effect/currency/provenance/file-size CHECKs, normalized history uniqueness, signature name/role CHECKs, RLS and role revokes augment Prisma. All migration files are inventoried below; apply the real files, not `db push`, so none of these safeguards disappears.

`protect_financial_amounts` rejects changes to **every non-status field** using JSON comparison and rejects updates after VOID; it still is not a DELETE guard. `prevent_signature_update` rejects UPDATE but is not a DELETE guard and organization has a cascade relation. Historical/live duplicate triggers serialize by organization but their snapshot/race behavior must be exercised under the selected isolation level. Advisory locks and explicit row locks are part of current correctness, not optional performance hints.

Services use interactive callback transactions, nested writes and batched read transactions. Driver invitations use 30s/20s timeouts; import confirmation uses 60s. File/provider work can occur inside callbacks; new distributed retry logic must separate durable intents/receipts first. Source searches found no generic serialization retry registry, no tenant session-context RLS protocol and no unsafe raw-query variants in reviewed runtime source. The generated appendix enumerates each raw SQL/transaction/lock call-site location; draft/unmounted files remain distinguishable by their filenames.

## Exhaustive source inventory

The following generated appendix retains every schema declaration relevant to requested types, IDs, relations and indexes, plus all enum members and every SQL migration with content fingerprint. Counts describe source, not live catalogs. Any future schema change requires regeneration/review.

<!-- LP-PROD-001 GENERATED INVENTORY -->

SOURCE fingerprint: schema SHA-256 `5b96203df4a5d577ef38d9502ebfdd46934018afff7032c93336b0e6fd82df67`. 26 models, 26 enums, 0 composite primary IDs, 34 compound unique declarations, 40 model index declarations.

### All enum definitions

- **DriverStatus:** `ACTIVE`, `INACTIVE`.

- **LoadAssignmentStatus:** `ASSIGNED`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.

- **DocumentType:** `RATE_CONFIRMATION`, `BOL`, `POD`, `CARRIER_INVOICE`, `LUMPER_RECEIPT`, `SCALE_TICKET`, `OTHER`.

- **DocumentStatus:** `UPLOADED`, `TEXT_EXTRACTED`, `REVIEW_REQUIRED`, `CONFIRMED`.

- **LoadStatus:** `BOOKED`, `IN_TRANSIT`, `DELIVERED`, `PAYMENT_READY`, `INVOICED`, `PAID`.

- **StopType:** `PICKUP`, `DELIVERY`.

- **RequirementLevel:** `REQUIRED`, `CONDITIONAL`.

- **RequirementStatus:** `MISSING`, `RECEIVED`, `ACCEPTED`, `WAIVED`, `REJECTED`.

- **LoadEventType:** `LOAD_CREATED`, `DRIVER_ASSIGNED`, `DRIVER_ACCEPTED`, `LOAD_STARTED`, `ARRIVED_PICKUP`, `DEPARTED_PICKUP`, `ARRIVED_DELIVERY`, `DEPARTED_DELIVERY`, `DOCUMENT_CAPTURED`, `DOCUMENT_SIGNATURE_CAPTURED`, `DOCUMENT_VALIDATED`, `DOCUMENT_REJECTED`, `DOCUMENT_WAIVED`, `DELIVERY_CONFIRMED`, `LOAD_COMPLETED`, `AGREEMENT_CREATED`, `AGREEMENT_ACCEPTED`, `AGREEMENT_EXECUTED`, `AGREEMENT_SUPERSEDED`, `CHARGE_OPPORTUNITY_DETECTED`, `CHARGE_OPPORTUNITY_APPROVED`, `CHARGE_OPPORTUNITY_DISMISSED`, `CHARGE_OPPORTUNITY_BILLED`, `PAYMENT_READY`, `INVOICE_CREATED`, `BILLING_SUBMITTED`, `PAYMENT_RECEIVED`.

- **LoadEventActorType:** `SYSTEM`, `OWNER`, `DRIVER`, `BROKER`, `SHIPPER`, `RECEIVER`, `OTHER`.

- **LoadChargeOpportunityType:** `LUMPER_REIMBURSEMENT`, `DETENTION`, `LAYOVER`, `TONU`, `SCALE_REIMBURSEMENT`, `OTHER`.

- **LoadChargeOpportunityStatus:** `DETECTED`, `APPROVED`, `DISMISSED`, `BILLED`.

- **AgreementType:** `RATE_CONFIRMATION`, `LOAD_AMENDMENT`, `BROKER_CARRIER`, `CHARGE_APPROVAL`, `BILLING_APPROVAL`, `OTHER`.

- **AgreementStatus:** `DRAFT`, `PENDING`, `EXECUTED`, `SUPERSEDED`, `VOIDED`.

- **AgreementPartyRole:** `BROKER`, `CARRIER`, `OWNER`, `DRIVER`, `SHIPPER`, `RECEIVER`, `OTHER`.

- **AgreementAcceptanceMethod:** `CLICK_ACCEPT`, `DRAWN_SIGNATURE`, `EXTERNAL_ESIGN`.

- **ExternalTransactionRole:** `BROKER`, `SHIPPER`, `RECEIVER`, `OTHER`.

- **CompanyDocumentType:** `W9`, `CERTIFICATE_OF_INSURANCE`, `OPERATING_AUTHORITY`, `PERMIT`, `OTHER`.

- **DriverDocumentType:** `CDL`, `MEDICAL_CERTIFICATE`, `MVR`, `OTHER`.

- **DriverInvitationStatus:** `PENDING`, `ACCEPTED`, `CANCELLED`.

- **UserRole:** `OWNER`, `DISPATCHER`, `BACK_OFFICE`, `DRIVER`.

- **FinancialType:** `INCOME`, `EXPENSE`, `PAYMENT`, `ADJUSTMENT`, `DRIVER_PAY`.

- **FinancialEffect:** `INCOME`, `EXPENSE`, `PAYMENT`.

- **FinancialStatus:** `POSTED`, `VOID`.

- **FinancialSource:** `MANUAL`, `IMPORT`.

- **FinancialImportStatus:** `DRAFT`, `PREVIEWED`, `CONFIRMED`, `REVERSED`.

### Model keys, fields, relations and indexes

All models use a scalar UUID primary key; every non-Organization model has organizationId. Native UUID annotations, Decimal, Json, Bytes, DateTime, enum scalar fields, relation actions and unique/index declarations are copied below, preserving declared defaults. Unannotated relation actions must be resolved against migration SQL, not invented. Plain descriptive string fields are omitted unless unique.

#### Organization

```prisma
id        String   @id @default(uuid()) @db.Uuid
createdAt DateTime @default(now()) @map("created_at")
updatedAt DateTime @updatedAt @map("updated_at")
@@map("organizations")
```

#### LoadAssignment

```prisma
id             String               @id @default(uuid()) @db.Uuid
organizationId String               @map("organization_id") @db.Uuid
loadId         String               @map("load_id") @db.Uuid
driverId       String               @map("driver_id") @db.Uuid
status         LoadAssignmentStatus @default(ASSIGNED)
assignedAt  DateTime  @default(now()) @map("assigned_at")
acceptedAt  DateTime? @map("accepted_at")
completedAt DateTime? @map("completed_at")
createdAt DateTime @default(now()) @map("created_at")
updatedAt DateTime @updatedAt @map("updated_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
load         Load         @relation(fields: [loadId], references: [id], onDelete: Cascade)
driver       Driver       @relation(fields: [driverId], references: [id], onDelete: Restrict)
@@unique([organizationId, loadId])
@@index([organizationId, driverId])
@@index([organizationId, status])
@@map("load_assignments")
```

#### Document

```prisma
id             String         @id @default(uuid()) @db.Uuid
organizationId String         @map("organization_id") @db.Uuid
status         DocumentStatus @default(UPLOADED)
createdAt      DateTime       @default(now()) @map("created_at")
updatedAt      DateTime       @updatedAt @map("updated_at")
organization        Organization            @relation(fields: [organizationId], references: [id], onDelete: Cascade)
@@unique([id, organizationId])
@@index([organizationId])
@@map("documents")
```

#### DocumentVersion

```prisma
id               String   @id @default(uuid()) @db.Uuid
organizationId   String   @map("organization_id") @db.Uuid
documentId       String   @map("document_id") @db.Uuid
createdAt        DateTime @default(now()) @map("created_at")
uploadedByUserId String? @map("uploaded_by_user_id") @db.Uuid
uploadKey String? @map("upload_key") @db.Uuid
issuedAt DateTime? @map("issued_at") @db.Date
expiresAt DateTime? @map("expires_at") @db.Date
uploadedBy User? @relation(fields: [uploadedByUserId, organizationId], references: [id, organizationId], onDelete: Restrict)
organization      Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
document          Document           @relation(fields: [documentId], references: [id], onDelete: Cascade)
currentRequirements LoadRequirement[] @relation("CurrentRequirementVersion")
reviewedRequirements LoadRequirement[] @relation("ReviewedRequirementVersion")
@@unique([id, documentId, organizationId])
@@unique([documentId, versionNumber])
@@unique([id, organizationId])
@@unique([organizationId, uploadKey])
@@unique([organizationId, storageKey])
@@index([organizationId, checksum])
@@map("document_versions")
```

#### OrganizationDocument

```prisma
id String @id @default(uuid()) @db.Uuid
organizationId String @map("organization_id") @db.Uuid
documentId String @unique @map("document_id") @db.Uuid
createdAt DateTime @default(now()) @map("created_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
document Document @relation(fields: [documentId, organizationId], references: [id, organizationId], onDelete: Restrict)
@@unique([documentId, organizationId])
@@index([organizationId, type])
@@map("organization_documents")
```

#### DriverDocument

```prisma
id String @id @default(uuid()) @db.Uuid
organizationId String @map("organization_id") @db.Uuid
driverId String @map("driver_id") @db.Uuid
documentId String @unique @map("document_id") @db.Uuid
createdAt DateTime @default(now()) @map("created_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
driver Driver @relation(fields: [driverId, organizationId], references: [id, organizationId], onDelete: Restrict)
document Document @relation(fields: [documentId, organizationId], references: [id, organizationId], onDelete: Restrict)
@@unique([documentId, organizationId])
@@index([organizationId, driverId, type])
@@map("driver_documents")
```

#### Load

```prisma
id             String     @id @default(uuid()) @db.Uuid
organizationId String     @map("organization_id") @db.Uuid
status         LoadStatus @default(BOOKED)
linehaul      Decimal? @db.Decimal(12, 2)
fuelSurcharge Decimal? @map("fuel_surcharge") @db.Decimal(12, 2)
totalRate     Decimal  @map("total_rate") @db.Decimal(12, 2)
createdAt DateTime @default(now()) @map("created_at")
updatedAt DateTime @updatedAt @map("updated_at")
organization Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
invoiceIssuedAt       DateTime? @map("invoice_issued_at")
billingSubmittedAt    DateTime? @map("billing_submitted_at")
paymentDueAt          DateTime? @map("payment_due_at")
paidAt                DateTime? @map("paid_at")
amountPaid            Decimal?  @map("amount_paid") @db.Decimal(12, 2)
@@unique([id, organizationId])
@@unique([organizationId, loadNumber])
@@index([organizationId, status])
@@map("loads")
```

#### LoadPayment

```prisma
id String @id @default(uuid()) @db.Uuid
organizationId String @map("organization_id") @db.Uuid
loadId String @map("load_id") @db.Uuid
amount Decimal @db.Decimal(12, 2)
recordedByUserId String? @map("recorded_by_user_id") @db.Uuid
recordedAt DateTime @map("recorded_at")
createdAt DateTime @default(now()) @map("created_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
load Load @relation(fields: [loadId, organizationId], references: [id, organizationId], onDelete: Restrict)
recordedBy User? @relation(fields: [recordedByUserId, organizationId], references: [id, organizationId], onDelete: Restrict)
@@unique([organizationId, loadId, idempotencyKey])
@@index([organizationId, loadId, recordedAt])
@@map("load_payments")
```

#### LoadStop

```prisma
id              String   @id @default(uuid()) @db.Uuid
organizationId  String   @map("organization_id") @db.Uuid
loadId          String   @map("load_id") @db.Uuid
arrivedAt       DateTime? @map("arrived_at")
departedAt      DateTime? @map("departed_at")
createdAt       DateTime @default(now()) @map("created_at")
updatedAt       DateTime @updatedAt @map("updated_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
load         Load         @relation(fields: [loadId], references: [id], onDelete: Cascade)
@@unique([loadId, sequence])
@@index([organizationId, loadId])
@@map("load_stops")
```

#### LoadDocument

```prisma
id             String       @id @default(uuid()) @db.Uuid
organizationId String       @map("organization_id") @db.Uuid
loadId         String       @map("load_id") @db.Uuid
documentId     String       @map("document_id") @db.Uuid
createdAt      DateTime     @default(now()) @map("created_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
load         Load         @relation(fields: [loadId], references: [id], onDelete: Cascade)
document     Document     @relation(fields: [documentId], references: [id], onDelete: Cascade)
@@unique([organizationId, loadId, documentId, role])
@@index([organizationId, loadId])
@@map("load_documents")
```

#### LoadRequirement

```prisma
id             String            @id @default(uuid()) @db.Uuid
organizationId String            @map("organization_id") @db.Uuid
loadId         String            @map("load_id") @db.Uuid
documentType   DocumentType      @map("document_type")
status         RequirementStatus @default(MISSING)
currentVersionId String? @map("current_version_id") @db.Uuid
reviewedVersionId String? @map("reviewed_version_id") @db.Uuid
reviewedByUserId String? @map("reviewed_by_user_id") @db.Uuid
reviewedAt DateTime? @map("reviewed_at")
currentVersion DocumentVersion? @relation("CurrentRequirementVersion", fields: [currentVersionId, organizationId], references: [id, organizationId], onDelete: Restrict)
reviewedVersion DocumentVersion? @relation("ReviewedRequirementVersion", fields: [reviewedVersionId, organizationId], references: [id, organizationId], onDelete: Restrict)
reviewedBy User? @relation(fields: [reviewedByUserId, organizationId], references: [id, organizationId], onDelete: Restrict)
createdAt      DateTime          @default(now()) @map("created_at")
updatedAt      DateTime          @updatedAt @map("updated_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
load         Load         @relation(fields: [loadId], references: [id], onDelete: Cascade)
@@unique([loadId, documentType])
@@index([organizationId, loadId])
@@index([organizationId, status])
@@map("load_requirements")
```

#### Driver

```prisma
id             String       @id @default(uuid()) @db.Uuid
organizationId String       @map("organization_id") @db.Uuid
status         DriverStatus @default(ACTIVE)
cdlExpirationDate DateTime? @map("cdl_expiration_date") @db.Date
hireDate DateTime? @map("hire_date") @db.Date
userId         String?      @unique @map("user_id") @db.Uuid
user           User?        @relation(fields: [userId, organizationId], references: [id, organizationId], onDelete: Restrict)
createdAt DateTime @default(now()) @map("created_at")
updatedAt DateTime @updatedAt @map("updated_at")
organization Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
@@unique([id, organizationId])
@@unique([userId, organizationId])
@@index([organizationId, status])
@@index([organizationId, lastName])
@@map("drivers")
```

#### DriverInvitation

```prisma
id String @id @default(uuid()) @db.Uuid
organizationId String @map("organization_id") @db.Uuid
driverId String @unique @map("driver_id") @db.Uuid
authUserId String? @unique @map("auth_user_id") @db.Uuid
status DriverInvitationStatus @default(PENDING)
firstSentAt DateTime @default(now()) @map("first_sent_at")
lastSentAt DateTime @default(now()) @map("last_sent_at")
acceptedAt DateTime? @map("accepted_at")
cancelledAt DateTime? @map("cancelled_at")
createdAt DateTime @default(now()) @map("created_at")
updatedAt DateTime @updatedAt @map("updated_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
driver Driver @relation(fields: [driverId, organizationId], references: [id, organizationId], onDelete: Restrict)
@@unique([driverId, organizationId])
@@index([organizationId, status])
@@map("driver_invitations")
```

#### User

```prisma
id             String   @id @default(uuid()) @db.Uuid
authUserId     String   @unique @map("auth_user_id") @db.Uuid
organizationId String   @map("organization_id") @db.Uuid
createdAt      DateTime @default(now()) @map("created_at")
updatedAt      DateTime @updatedAt @map("updated_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
@@unique([id, organizationId])
@@unique([organizationId, email])
@@index([organizationId, role])
@@map("users")
```

#### LoadEvent

```prisma
id             String             @id @default(uuid()) @db.Uuid
organizationId String             @map("organization_id") @db.Uuid
loadId         String             @map("load_id") @db.Uuid
actorType      LoadEventActorType @default(SYSTEM) @map("actor_type")
actorId        String?            @map("actor_id") @db.Uuid
occurredAt     DateTime           @default(now()) @map("occurred_at")
createdAt      DateTime           @default(now()) @map("created_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
load         Load         @relation(fields: [loadId], references: [id], onDelete: Cascade)
@@index([organizationId, loadId, occurredAt])
@@index([organizationId, type])
@@map("load_events")
```

#### LoadChargeOpportunity

```prisma
id               String                      @id @default(uuid()) @db.Uuid
organizationId   String                      @map("organization_id") @db.Uuid
loadId           String                      @map("load_id") @db.Uuid
sourceDocumentId String?                     @map("source_document_id") @db.Uuid
status           LoadChargeOpportunityStatus @default(DETECTED)
amount           Decimal?                    @db.Decimal(12, 2)
detectedAt       DateTime                    @default(now()) @map("detected_at")
resolvedAt       DateTime?                   @map("resolved_at")
createdAt        DateTime                    @default(now()) @map("created_at")
updatedAt        DateTime                    @updatedAt @map("updated_at")
organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
load           Load         @relation(fields: [loadId], references: [id], onDelete: Cascade)
sourceDocument Document?    @relation(fields: [sourceDocumentId], references: [id], onDelete: SetNull)
@@index([organizationId, loadId])
@@index([organizationId, status])
@@index([loadId, type])
@@unique([organizationId, loadId, detectionKey])
@@map("load_charge_opportunities")
```

#### Agreement

```prisma
id             String          @id @default(uuid()) @db.Uuid
organizationId String          @map("organization_id") @db.Uuid
loadId         String          @map("load_id") @db.Uuid
status         AgreementStatus @default(DRAFT)
createdAt      DateTime        @default(now()) @map("created_at")
updatedAt      DateTime        @updatedAt @map("updated_at")
organization     Organization                @relation(fields: [organizationId], references: [id], onDelete: Cascade)
load             Load                        @relation(fields: [loadId], references: [id], onDelete: Cascade)
@@index([organizationId, loadId])
@@index([organizationId, status])
@@map("agreements")
```

#### AgreementVersion

```prisma
id                      String   @id @default(uuid()) @db.Uuid
organizationId          String   @map("organization_id") @db.Uuid
agreementId             String   @map("agreement_id") @db.Uuid
sourceDocumentVersionId String?  @map("source_document_version_id") @db.Uuid
totalAmount             Decimal? @map("total_amount") @db.Decimal(12, 2)
createdAt               DateTime @default(now()) @map("created_at")
organization          Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
agreement             Agreement             @relation(fields: [agreementId], references: [id], onDelete: Cascade)
sourceDocumentVersion DocumentVersion?      @relation(fields: [sourceDocumentVersionId], references: [id], onDelete: SetNull)
@@unique([agreementId, versionNumber])
@@index([organizationId, agreementId])
@@index([organizationId, contentHash])
@@map("agreement_versions")
```

#### AgreementAcceptance

```prisma
id                  String                    @id @default(uuid()) @db.Uuid
organizationId      String                    @map("organization_id") @db.Uuid
agreementVersionId  String                    @map("agreement_version_id") @db.Uuid
partyRole           AgreementPartyRole        @map("party_role")
acceptedAt          DateTime                  @default(now()) @map("accepted_at")
createdAt           DateTime                  @default(now()) @map("created_at")
organization     Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
agreementVersion AgreementVersion @relation(fields: [agreementVersionId], references: [id], onDelete: Cascade)
@@unique([agreementVersionId, partyRole])
@@index([organizationId, acceptedAt])
@@map("agreement_acceptances")
```

#### ExternalTransactionAccess

```prisma
id             String                  @id @default(uuid()) @db.Uuid
organizationId String                  @map("organization_id") @db.Uuid
loadId         String                  @map("load_id") @db.Uuid
agreementId    String?                 @map("agreement_id") @db.Uuid
tokenHash      String                  @unique @map("token_hash") @db.VarChar(64)
expiresAt      DateTime                @map("expires_at")
revokedAt      DateTime?               @map("revoked_at")
lastAccessedAt DateTime?               @map("last_accessed_at")
createdAt      DateTime                @default(now()) @map("created_at")
updatedAt      DateTime                @updatedAt @map("updated_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
load         Load         @relation(fields: [loadId], references: [id], onDelete: Cascade)
agreement    Agreement?   @relation(fields: [agreementId], references: [id], onDelete: SetNull)
@@index([organizationId, loadId])
@@index([organizationId, role])
@@index([expiresAt])
@@map("external_transaction_access")
```

#### FinancialTransaction

```prisma
id String @id @default(uuid()) @db.Uuid
organizationId String @map("organization_id") @db.Uuid
amount Decimal @db.Decimal(12, 2)
transactionDate DateTime @map("transaction_date") @db.Date
loadId String? @map("load_id") @db.Uuid
driverId String? @map("driver_id") @db.Uuid
documentId String? @map("document_id") @db.Uuid
historicalLoadId String? @map("historical_load_id") @db.Uuid
importBatchId String? @map("import_batch_id") @db.Uuid
correctionOfId String? @map("correction_of_id") @db.Uuid
source FinancialSource @default(MANUAL)
status FinancialStatus @default(POSTED)
createdById String @map("created_by_id") @db.Uuid
createdAt DateTime @default(now()) @map("created_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
createdBy User @relation(fields: [createdById, organizationId], references: [id, organizationId], onDelete: Restrict)
load Load? @relation(fields: [loadId, organizationId], references: [id, organizationId], onDelete: Restrict)
driver Driver? @relation(fields: [driverId, organizationId], references: [id, organizationId], onDelete: Restrict)
document Document? @relation(fields: [documentId, organizationId], references: [id, organizationId], onDelete: Restrict)
historicalLoad HistoricalLoadRecord? @relation(fields: [historicalLoadId, organizationId], references: [id, organizationId], onDelete: Restrict)
importBatch FinancialImportBatch? @relation(fields: [importBatchId, organizationId], references: [id, organizationId], onDelete: Restrict)
correctionOf FinancialTransaction? @relation("FinancialCorrection", fields: [correctionOfId, organizationId], references: [id, organizationId], onDelete: Restrict)
corrections FinancialTransaction[] @relation("FinancialCorrection")
@@unique([id, organizationId])
@@unique([organizationId, idempotencyKey])
@@index([organizationId, transactionDate, type])
@@index([organizationId, category, transactionDate])
@@index([organizationId, loadId])
@@index([organizationId, driverId, transactionDate])
@@index([organizationId, importBatchId])
@@map("financial_transactions")
```

#### FinancialImportBatch

```prisma
id String @id @default(uuid()) @db.Uuid
organizationId String @map("organization_id") @db.Uuid
fileBytes Bytes @map("file_bytes")
columnMapping Json @map("column_mapping")
status FinancialImportStatus @default(DRAFT)
createdById String @map("created_by_id") @db.Uuid
createdAt DateTime @default(now()) @map("created_at")
completedAt DateTime? @map("completed_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
createdBy User @relation(fields: [createdById, organizationId], references: [id, organizationId], onDelete: Restrict)
@@unique([id, organizationId])
@@unique([organizationId, fileChecksum])
@@index([organizationId, createdAt])
@@map("financial_import_batches")
```

#### FinancialImportRow

```prisma
id String @id @default(uuid()) @db.Uuid
organizationId String @map("organization_id") @db.Uuid
batchId String @map("batch_id") @db.Uuid
normalizedData Json @map("normalized_data")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
batch FinancialImportBatch @relation(fields: [batchId, organizationId], references: [id, organizationId], onDelete: Restrict)
@@unique([batchId, rowNumber])
@@unique([id, organizationId])
@@index([organizationId, batchId])
@@map("financial_import_rows")
```

#### HistoricalLoadRecord

```prisma
id String @id @default(uuid()) @db.Uuid
organizationId String @map("organization_id") @db.Uuid
deliveryDate DateTime @map("delivery_date") @db.Date
miles Decimal? @db.Decimal(10, 2)
grossRevenue Decimal @map("gross_revenue") @db.Decimal(12, 2)
dueDate DateTime? @map("due_date") @db.Date
importBatchId String @map("import_batch_id") @db.Uuid
status FinancialStatus @default(POSTED)
createdAt DateTime @default(now()) @map("created_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
batch FinancialImportBatch @relation(fields: [importBatchId, organizationId], references: [id, organizationId], onDelete: Restrict)
@@unique([id, organizationId])
@@unique([organizationId, loadNumber])
@@unique([importBatchId, importRowNumber])
@@index([organizationId, deliveryDate])
@@map("historical_load_records")
```

#### FinancialAuditEvent

```prisma
id String @id @default(uuid()) @db.Uuid
organizationId String @map("organization_id") @db.Uuid
actorId String @map("actor_id") @db.Uuid
recordId String @map("record_id") @db.Uuid
createdAt DateTime @default(now()) @map("created_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
actor User @relation(fields: [actorId, organizationId], references: [id, organizationId], onDelete: Restrict)
@@index([organizationId, createdAt])
@@index([organizationId, recordId])
@@map("financial_audit_events")
```

#### DocumentSignature

```prisma
id String @id @default(uuid()) @db.Uuid
organizationId String @map("organization_id") @db.Uuid
loadId String @map("load_id") @db.Uuid
documentId String @map("document_id") @db.Uuid
documentVersionId String @map("document_version_id") @db.Uuid
documentType DocumentType @map("document_type")
signedAt DateTime @default(now()) @map("signed_at")
createdByUserId String @map("created_by_user_id") @db.Uuid
createdAt DateTime @default(now()) @map("created_at")
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade, onUpdate: NoAction)
load Load @relation(fields: [loadId, organizationId], references: [id, organizationId], onDelete: Restrict, onUpdate: NoAction, map: "document_signatures_load_fkey")
version DocumentVersion @relation(fields: [documentVersionId, documentId, organizationId], references: [id, documentId, organizationId], onDelete: Restrict, onUpdate: NoAction, map: "document_signatures_version_fkey")
link LoadDocument @relation(fields: [organizationId, loadId, documentId, documentType], references: [organizationId, loadId, documentId, role], onDelete: Restrict, onUpdate: NoAction, map: "document_signatures_link_fkey")
createdBy User @relation(fields: [createdByUserId, organizationId], references: [id, organizationId], onDelete: Restrict, onUpdate: NoAction, map: "document_signatures_actor_fkey")
@@unique([organizationId, createdByUserId, idempotencyKey], map: "document_signatures_organization_id_created_by_user_id_idemp_ke")
@@unique([organizationId, signatureStorageKey])
@@index([organizationId, documentId, documentVersionId], map: "document_signatures_organization_id_document_id_document_ver_id")
@@map("document_signatures")
```

### All migration files and custom SQL markers

SQL files remain unchanged. Marker summaries are navigation aids; linked SQL is authoritative, including multiline constraints/functions and data backfills. No migration was executed in this task.

#### 20260911022418_init_loadpacket_core

[SOURCE SQL](../../apps/api/prisma/migrations/20260911022418_init_loadpacket_core/migration.sql) — SHA-256 `a673d44fa16bbbc874fc67854ae075242d6982e477db6a66a133d23905ed7604`.

Standard schema/index/FK DDL; inspect the complete file for exact names and referential actions.

#### 20260911031541_add_driver_assignments

[SOURCE SQL](../../apps/api/prisma/migrations/20260911031541_add_driver_assignments/migration.sql) — SHA-256 `9a40654cb82efa37f1b239779cc485c1be9b5fb8ff2041a475282127bb9875df`.

Standard schema/index/FK DDL; inspect the complete file for exact names and referential actions.

#### 20260916033026_add_billing_tracking

[SOURCE SQL](../../apps/api/prisma/migrations/20260916033026_add_billing_tracking/migration.sql) — SHA-256 `01ba651208bb08d88d7dfa51b637167cdcab3b80d55c1f258cc08e3ebf6837e6`.

Standard schema/index/FK DDL; inspect the complete file for exact names and referential actions.

#### 20260916044641_unique_load_number_per_organization

[SOURCE SQL](../../apps/api/prisma/migrations/20260916044641_unique_load_number_per_organization/migration.sql) — SHA-256 `9b4e87f70651e97ecd4ca8d3d4c9842109ee0f4202969d5c3f4b787c64e85981`.

Standard schema/index/FK DDL; inspect the complete file for exact names and referential actions.

#### 20260916045951_enforce_load_rate_consistency

[SOURCE SQL](../../apps/api/prisma/migrations/20260916045951_enforce_load_rate_consistency/migration.sql) — SHA-256 `1a2e5f05f60eeb86966405ef4445c5dc71b50642efd3d6a83cb83e69f75d445c`.

- Line 3: `CHECK (`

#### 20260917031232_add_day6_autopilot_foundation

[SOURCE SQL](../../apps/api/prisma/migrations/20260917031232_add_day6_autopilot_foundation/migration.sql) — SHA-256 `6b55d869df8dca53cef14d84347e89de52b863217decaccf00f755d4f34de0e2`.

Standard schema/index/FK DDL; inspect the complete file for exact names and referential actions.

#### 20260917120000_add_auth_foundation

[SOURCE SQL](../../apps/api/prisma/migrations/20260917120000_add_auth_foundation/migration.sql) — SHA-256 `e774e12018ea79d4f0a884eb0ee586934a706b46cfd01c016e6a551e415463f1`.

- Line 31: `ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;`
- Line 37: `EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);`
- Line 39: `EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', table_name);`
- Line 42: `EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated', table_name);`

#### 20260919120000_add_company_driver_management

[SOURCE SQL](../../apps/api/prisma/migrations/20260919120000_add_company_driver_management/migration.sql) — SHA-256 `c6670a4629973b2b1994f6db324d3de86345d7498cc9c29f3be5180dd7c23dc9`.

- Line 16: `ADD CONSTRAINT "organizations_payment_terms_range" CHECK ("default_payment_terms_days" BETWEEN 0 AND 365);`
- Line 26: `ON "drivers" ("organization_id", lower(btrim("email")))`

#### 20260919140000_add_driver_invitation_flow

[SOURCE SQL](../../apps/api/prisma/migrations/20260919140000_add_driver_invitation_flow/migration.sql) — SHA-256 `f8503c64dad72af54da886198d293bbcfe5fc78dc9856704ad935c96776d60af`.

- Line 24: `ALTER TABLE "driver_invitations" ENABLE ROW LEVEL SECURITY;`
- Line 25: `REVOKE ALL ON "driver_invitations" FROM anon, authenticated;`

#### 20260920031500_add_business_document_vault

[SOURCE SQL](../../apps/api/prisma/migrations/20260920031500_add_business_document_vault/migration.sql) — SHA-256 `bdb9d48646685bf4fad51f24823fabdcbc8b916acff369d5939b8ff1a8994ded`.

- Line 8: `ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_date_order" CHECK ("issued_at" IS NULL OR "expires_at" IS NULL OR "expires_at" >= "issued_at");`
- Line 28: `ALTER TABLE "organization_documents" ENABLE ROW LEVEL SECURITY;`
- Line 29: `ALTER TABLE "driver_documents" ENABLE ROW LEVEL SECURITY;`
- Line 30: `REVOKE ALL ON "organization_documents", "driver_documents" FROM anon, authenticated;`

#### 20260920041000_add_document_review

[SOURCE SQL](../../apps/api/prisma/migrations/20260920041000_add_document_review/migration.sql) — SHA-256 `cc92c68d7ecf94027ed081a7a1075f92dde73541dce15098dc4f49d47a33757e`.

Standard schema/index/FK DDL; inspect the complete file for exact names and referential actions.

#### 20260920053000_add_payment_ledger

[SOURCE SQL](../../apps/api/prisma/migrations/20260920053000_add_payment_ledger/migration.sql) — SHA-256 `b68ec956a2fb46db7c69a5844e1d2d34adcdf0cb87ca1be3277de5bda534a247`.

- Line 7: `CONSTRAINT "load_payments_positive_amount" CHECK ("amount" > 0),`
- Line 17: `SELECT gen_random_uuid(),"organization_id","id","amount_paid","currency",'legacy:' || "id"::text,COALESCE("paid_at","updated_at") FROM "loads" WHERE "amount_paid" > 0;`
- Line 18: `ALTER TABLE "load_payments" ENABLE ROW LEVEL SECURITY;`
- Line 19: `REVOKE ALL ON "load_payments" FROM anon, authenticated;`

#### 20260920120000_add_stop_event_timestamps

[SOURCE SQL](../../apps/api/prisma/migrations/20260920120000_add_stop_event_timestamps/migration.sql) — SHA-256 `5cfb5e76c2c81e3717e555f7d0a7b37f9f24a2aa1bcf9623c175da49ad85f9d2`.

- Line 6: `CHECK ("departed_at" IS NULL OR ("arrived_at" IS NOT NULL AND "departed_at" >= "arrived_at"));`

#### 20260923120000_add_detention_evidence

[SOURCE SQL](../../apps/api/prisma/migrations/20260923120000_add_detention_evidence/migration.sql) — SHA-256 `a2778b1a84435c6148be1a01d77f0ff1ff733f5e834e3db9d06d6d2e6b94c05d`.

Standard schema/index/FK DDL; inspect the complete file for exact names and referential actions.

#### 20260927170000_finance_foundation

[SOURCE SQL](../../apps/api/prisma/migrations/20260927170000_finance_foundation/migration.sql) — SHA-256 `a497416d05c798cf7a7fb78f18ca3381ac6b6c63af3129e93fbaaf954b4c158a`.

- Line 224: `ALTER TABLE financial_transactions ADD CONSTRAINT finance_currency CHECK (currency='USD'),`
- Line 225: `ADD CONSTRAINT finance_amount CHECK ((type='ADJUSTMENT' OR amount >= 0) AND amount <> 0),`
- Line 226: `ADD CONSTRAINT finance_effect CHECK ((type='INCOME' AND effect='INCOME') OR (type IN ('EXPENSE','DRIVER_PAY') AND effect='EXPENSE') OR (type='PAYMENT' AND effect='PAYMENT') OR type='ADJUSTMENT'),`
- Line 227: `ADD CONSTRAINT finance_provenance CHECK ((source='MANUAL' AND import_batch_id IS NULL) OR (source='IMPORT' AND import_batch_id IS NOT NULL AND import_row_number IS NOT NULL AND historical_load_id IS NOT NULL));`
- Line 228: `ALTER TABLE financial_import_batches ADD CONSTRAINT finance_file_limit CHECK (octet_length(file_bytes) <= 5242880);`
- Line 230: `CREATE VIEW finance_records AS`
- Line 255: `CREATE FUNCTION protect_financial_amounts() RETURNS trigger LANGUAGE plpgsql AS $$`
- Line 258: `RAISE EXCEPTION 'Financial entries are immutable; record an adjustment';`
- Line 262: `CREATE TRIGGER financial_amounts_immutable BEFORE UPDATE ON financial_transactions`

#### 20260927180000_finance_isolation

[SOURCE SQL](../../apps/api/prisma/migrations/20260927180000_finance_isolation/migration.sql) — SHA-256 `3988f16d7e239137f6c8ebd9fa396bd2e47a0a80912f698dad2035db68fd7cb8`.

- Line 6: `EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);`
- Line 7: `IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',table_name); END IF;`
- Line 8: `IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',table_name); END IF;`
- Line 10: `IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON finance_records FROM anon; END IF;`
- Line 11: `IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON finance_records FROM authenticated; END IF;`
- Line 15: `CREATE FUNCTION prevent_historical_live_duplicate() RETURNS trigger LANGUAGE plpgsql AS $$`
- Line 17: `PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text,0));`
- Line 20: `(lower(btrim(load_number))=lower(btrim(NEW.load_number)) OR`
- Line 21: `(NEW.invoice_number IS NOT NULL AND lower(btrim(invoice_number))=lower(btrim(NEW.invoice_number))))) THEN`
- Line 22: `RAISE EXCEPTION 'Historical load or invoice already exists' USING ERRCODE='23505';`
- Line 26: `(lower(btrim(load_number))=lower(btrim(NEW.load_number)) OR`
- Line 27: `(NEW.invoice_number IS NOT NULL AND lower(btrim(invoice_number))=lower(btrim(NEW.invoice_number))))) THEN`
- Line 28: `RAISE EXCEPTION 'Load or invoice already exists in imported history' USING ERRCODE='23505';`
- Line 33: `CREATE TRIGGER historical_live_duplicate BEFORE INSERT OR UPDATE OF load_number,invoice_number ON historical_load_records FOR EACH ROW EXECUTE FUNCTION prevent_historical_live_duplicate();`
- Line 34: `CREATE TRIGGER live_historical_duplicate BEFORE INSERT OR UPDATE OF load_number,invoice_number ON loads FOR EACH ROW EXECUTE FUNCTION prevent_historical_live_duplicate();`
- Line 35: `CREATE UNIQUE INDEX historical_load_normalized ON historical_load_records(organization_id,lower(btrim(load_number)));`
- Line 36: `CREATE UNIQUE INDEX historical_invoice_normalized ON historical_load_records(organization_id,lower(btrim(invoice_number))) WHERE invoice_number IS NOT NULL;`

#### 20260928090000_document_signatures

[SOURCE SQL](../../apps/api/prisma/migrations/20260928090000_document_signatures/migration.sql) — SHA-256 `1f15b75959a1c10239124844fa5cbbca75385afd31e849f95e9d7a4d8a3588ff`.

- Line 10: `signer_name VARCHAR(120) NOT NULL CHECK (length(btrim(signer_name)) BETWEEN 1 AND 120),`
- Line 18: `CONSTRAINT document_signatures_role_check CHECK ((document_type='BOL' AND signer_role IN ('DRIVER','SHIPPER')) OR (document_type='POD' AND signer_role IN ('DRIVER','RECEIVER'))),`
- Line 27: `CREATE FUNCTION prevent_signature_update() RETURNS trigger LANGUAGE plpgsql AS $$`
- Line 28: `BEGIN RAISE EXCEPTION 'Captured signature evidence is immutable' USING ERRCODE='23514'; END $$;`
- Line 29: `CREATE TRIGGER document_signatures_immutable BEFORE UPDATE ON document_signatures FOR EACH ROW EXECUTE FUNCTION prevent_signature_update();`
- Line 30: `ALTER TABLE document_signatures ENABLE ROW LEVEL SECURITY;`
- Line 32: `IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON document_signatures FROM anon; END IF;`
- Line 33: `IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON document_signatures FROM authenticated; END IF;`

### Raw SQL, explicit locks and transaction call sites

SOURCE positions are one-based and were collected from application TypeScript excluding generated client and unit-test files. These are source declarations, not proof every file is mounted. See the [mutation route inventory](mutation-route-inventory.md) for runtime routing boundaries.

- [apps/api/src/agreements/agreements.service.ts](../../apps/api/src/agreements/agreements.service.ts) — 227 ($transaction); 414 ($transaction).

- [apps/api/src/app.controller.ts](../../apps/api/src/app.controller.ts) — 35 ($queryRaw).

- [apps/api/src/documents/document-review.service.ts](../../apps/api/src/documents/document-review.service.ts) — 109 ($transaction); 111 ($queryRaw); 112 (FOR UPDATE); 114 ($queryRaw); 115 (FOR UPDATE).

- [apps/api/src/documents/driver-document-capture.service.ts](../../apps/api/src/documents/driver-document-capture.service.ts) — 60 ($transaction); 61 ($queryRaw); 62 (FOR UPDATE); 94 ($queryRaw); 95 (FOR UPDATE).

- [apps/api/src/documents/signatures.service.ts](../../apps/api/src/documents/signatures.service.ts) — 123 ($transaction); 124 ($executeRaw); 125 (pg_advisory_xact_lock); 128 ($queryRaw); 129 (FOR UPDATE).

- [apps/api/src/documents/vault.service.ts](../../apps/api/src/documents/vault.service.ts) — 232 ($transaction); 234 ($queryRaw); 235 (pg_advisory_xact_lock); 282 ($queryRaw); 283 (FOR UPDATE).

- [apps/api/src/drivers/driver-invitation.service.ts](../../apps/api/src/drivers/driver-invitation.service.ts) — 87 ($transaction); 178 ($transaction); 218 ($transaction).

- [apps/api/src/drivers/driver-lock.ts](../../apps/api/src/drivers/driver-lock.ts) — 10 ($queryRaw); 11 (FOR UPDATE).

- [apps/api/src/drivers/driver-management.service.ts](../../apps/api/src/drivers/driver-management.service.ts) — 196 ($transaction).

- [apps/api/src/drivers/drivers.service.ts](../../apps/api/src/drivers/drivers.service.ts) — 362 ($transaction); 363 ($queryRaw, FOR UPDATE); 492 ($transaction); 493 ($queryRaw, FOR UPDATE); 636 ($transaction); 637 ($queryRaw, FOR UPDATE).

- [apps/api/src/drivers/stop-events.service.ts](../../apps/api/src/drivers/stop-events.service.ts) — 42 ($transaction); 44 ($queryRaw, FOR UPDATE).

- [apps/api/src/external/external.service.ts](../../apps/api/src/external/external.service.ts) — 65 ($transaction); 66 ($queryRaw, FOR UPDATE); 95 ($transaction); 96 ($queryRaw, FOR UPDATE).

- [apps/api/src/finance/finance-import.service.ts](../../apps/api/src/finance/finance-import.service.ts) — 85 ($transaction); 86 ($executeRaw, pg_advisory_xact_lock); 137 ($queryRaw); 160 ($transaction); 161 ($executeRaw, pg_advisory_xact_lock); 229 ($transaction); 231 ($executeRaw, pg_advisory_xact_lock); 393 ($transaction); 394 ($executeRaw, pg_advisory_xact_lock).

- [apps/api/src/finance/finance.service.ts](../../apps/api/src/finance/finance.service.ts) — 75 ($queryRaw); 89 ($queryRaw); 169 ($queryRaw); 172 ($queryRaw); 186 ($queryRaw); 259 ($transaction); 260 ($executeRaw, pg_advisory_xact_lock); 481 ($queryRaw); 492 ($queryRaw); 495 ($queryRaw); 500 ($queryRaw); 526 ($queryRaw); 564 ($queryRaw).

- [apps/api/src/loads/accounts-receivable.service.ts](../../apps/api/src/loads/accounts-receivable.service.ts) — 281 ($transaction); 282 ($queryRaw); 283 (FOR UPDATE).

- [apps/api/src/loads/billing-submission.service.ts](../../apps/api/src/loads/billing-submission.service.ts) — 45 ($transaction); 46 ($queryRaw); 47 (FOR UPDATE).

- [apps/api/src/loads/carrier-invoice.service.ts](../../apps/api/src/loads/carrier-invoice.service.ts) — 209 ($transaction); 210 ($queryRaw); 211 (FOR UPDATE); 434 ($transaction).

- [apps/api/src/loads/loads.service.ts](../../apps/api/src/loads/loads.service.ts) — 125 ($transaction); 418 ($transaction); 420 ($queryRaw, FOR UPDATE).

- [apps/api/src/loads/manual-loads.service.ts](../../apps/api/src/loads/manual-loads.service.ts) — 51 ($transaction).

- [apps/api/src/loads/owner-dashboard.service.ts](../../apps/api/src/loads/owner-dashboard.service.ts) — 34 ($transaction); 394 ($transaction).

- [apps/api/src/loads/readiness-transition.ts](../../apps/api/src/loads/readiness-transition.ts) — 14 ($queryRaw); 15 (FOR UPDATE).

- [apps/api/src/money-opportunities/detention.service.ts](../../apps/api/src/money-opportunities/detention.service.ts) — 21 ($transaction); 23 ($queryRaw, FOR UPDATE).

- [apps/api/src/money-opportunities/money-opportunities.service.ts](../../apps/api/src/money-opportunities/money-opportunities.service.ts) — 115 ($transaction); 116 ($queryRaw); 120 (FOR UPDATE); 210 ($executeRaw); 441 ($transaction); 442 ($queryRaw, FOR UPDATE); 501 ($transaction); 502 ($queryRaw, FOR UPDATE); 592 ($transaction); 593 ($queryRaw, FOR UPDATE).
