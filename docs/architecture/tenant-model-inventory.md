# Tenant model inventory

Source: [current Prisma schema](../../apps/api/prisma/schema.prisma), inspected 2026-10-01. Every model is listed. Organization is the tenant root; all other models carry organizationId. Relation findings describe database safeguards, not demonstrated exploitable endpoints. API scoping remains necessary. RLS migrations primarily deny public Data API roles; runtime tenant enforcement is not proven.

## Organization

- Tenant ownership: root id.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: No declared cascading relation in this model; verify runtime DELETE privilege and dependent cascades.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## LoadAssignment

- Tenant ownership: organizationId present.
- Status: PARTIALLY_IMPLEMENTED — parent relations below lack tenant-composite FK.
- Review relationships: `load`, `driver`.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## Document

- Tenant ownership: organizationId present.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## DocumentVersion

- Tenant ownership: organizationId present.
- Status: PARTIALLY_IMPLEMENTED — parent relations below lack tenant-composite FK.
- Review relationships: `document`.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## OrganizationDocument

- Tenant ownership: organizationId present.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: No declared cascading relation in this model; verify runtime DELETE privilege and dependent cascades.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## DriverDocument

- Tenant ownership: organizationId present.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: No declared cascading relation in this model; verify runtime DELETE privilege and dependent cascades.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## Load

- Tenant ownership: organizationId present.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## LoadPayment

- Tenant ownership: organizationId present.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: No declared cascading relation in this model; verify runtime DELETE privilege and dependent cascades.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## LoadStop

- Tenant ownership: organizationId present.
- Status: PARTIALLY_IMPLEMENTED — parent relations below lack tenant-composite FK.
- Review relationships: `load`.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## LoadDocument

- Tenant ownership: organizationId present.
- Status: PARTIALLY_IMPLEMENTED — parent relations below lack tenant-composite FK.
- Review relationships: `load`, `document`.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## LoadRequirement

- Tenant ownership: organizationId present.
- Status: PARTIALLY_IMPLEMENTED — parent relations below lack tenant-composite FK.
- Review relationships: `load`.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## Driver

- Tenant ownership: organizationId present.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## DriverInvitation

- Tenant ownership: organizationId present.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: No declared cascading relation in this model; verify runtime DELETE privilege and dependent cascades.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## User

- Tenant ownership: organizationId present.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## LoadEvent

- Tenant ownership: organizationId present.
- Status: PARTIALLY_IMPLEMENTED — parent relations below lack tenant-composite FK.
- Review relationships: `load`.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## LoadChargeOpportunity

- Tenant ownership: organizationId present.
- Status: PARTIALLY_IMPLEMENTED — parent relations below lack tenant-composite FK.
- Review relationships: `load`, `sourceDocument`.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## Agreement

- Tenant ownership: organizationId present.
- Status: PARTIALLY_IMPLEMENTED — parent relations below lack tenant-composite FK.
- Review relationships: `load`.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## AgreementVersion

- Tenant ownership: organizationId present.
- Status: PARTIALLY_IMPLEMENTED — parent relations below lack tenant-composite FK.
- Review relationships: `agreement`, `sourceDocumentVersion`.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## AgreementAcceptance

- Tenant ownership: organizationId present.
- Status: PARTIALLY_IMPLEMENTED — parent relations below lack tenant-composite FK.
- Review relationships: `agreementVersion`.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## ExternalTransactionAccess

- Tenant ownership: organizationId present.
- Status: PARTIALLY_IMPLEMENTED — parent relations below lack tenant-composite FK.
- Review relationships: `load`, `agreement`.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## FinancialTransaction

- Tenant ownership: organizationId present.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: No declared cascading relation in this model; verify runtime DELETE privilege and dependent cascades.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## FinancialImportBatch

- Tenant ownership: organizationId present.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: No declared cascading relation in this model; verify runtime DELETE privilege and dependent cascades.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## FinancialImportRow

- Tenant ownership: organizationId present.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: No declared cascading relation in this model; verify runtime DELETE privilege and dependent cascades.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## HistoricalLoadRecord

- Tenant ownership: organizationId present.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: No declared cascading relation in this model; verify runtime DELETE privilege and dependent cascades.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## FinancialAuditEvent

- Tenant ownership: organizationId present.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: No declared cascading relation in this model; verify runtime DELETE privilege and dependent cascades.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## DocumentSignature

- Tenant ownership: organizationId present.
- Status: IMPLEMENTED ownership/declared tenant relations; full runtime isolation remains PARTIALLY_IMPLEMENTED.
- Deletion review: Cascade exists; prevent unintended tenant/evidence/audit removal through approved retention policy.
- Required tests: wrong-tenant parent/actor IDs, scoped reads/exports and authorized replay; direct DB constraint/role test for this model.

## Shared findings

No model here represents a durable outbox, operation registry, support session or device queue. New models must retain tenant ownership and scoped uniqueness. DocumentVersion checksum is stored, but database immutability is not universal; DocumentSignature UPDATE protection does not forbid DELETE. HistoricalLoadRecord has no explicit currency field; verify provenance before any backfill. AgreementAcceptance.providerEnvelopeId is an integration-boundary cleanup candidate. Follow [tenant architecture](multi-tenancy.md), [Finance/evidence ticket](implementation-backlog.md) and [customer lifecycle](customer-data-lifecycle.md).
