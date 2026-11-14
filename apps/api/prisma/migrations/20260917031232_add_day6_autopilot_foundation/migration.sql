-- CreateEnum
CREATE TYPE "LoadEventType" AS ENUM ('LOAD_CREATED', 'DRIVER_ASSIGNED', 'DRIVER_ACCEPTED', 'LOAD_STARTED', 'ARRIVED_PICKUP', 'DEPARTED_PICKUP', 'ARRIVED_DELIVERY', 'DEPARTED_DELIVERY', 'DOCUMENT_CAPTURED', 'DOCUMENT_VALIDATED', 'DELIVERY_CONFIRMED', 'LOAD_COMPLETED', 'AGREEMENT_CREATED', 'AGREEMENT_ACCEPTED', 'AGREEMENT_EXECUTED', 'AGREEMENT_SUPERSEDED', 'CHARGE_OPPORTUNITY_DETECTED', 'CHARGE_OPPORTUNITY_APPROVED', 'CHARGE_OPPORTUNITY_DISMISSED', 'CHARGE_OPPORTUNITY_BILLED', 'PAYMENT_READY', 'INVOICE_CREATED', 'BILLING_SUBMITTED', 'PAYMENT_RECEIVED');

-- CreateEnum
CREATE TYPE "LoadEventActorType" AS ENUM ('SYSTEM', 'OWNER', 'DRIVER', 'BROKER', 'SHIPPER', 'RECEIVER', 'OTHER');

-- CreateEnum
CREATE TYPE "LoadChargeOpportunityType" AS ENUM ('LUMPER_REIMBURSEMENT', 'DETENTION', 'LAYOVER', 'TONU', 'SCALE_REIMBURSEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "LoadChargeOpportunityStatus" AS ENUM ('DETECTED', 'APPROVED', 'DISMISSED', 'BILLED');

-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('RATE_CONFIRMATION', 'LOAD_AMENDMENT', 'BROKER_CARRIER', 'CHARGE_APPROVAL', 'BILLING_APPROVAL', 'OTHER');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'PENDING', 'EXECUTED', 'SUPERSEDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "AgreementPartyRole" AS ENUM ('BROKER', 'CARRIER', 'OWNER', 'DRIVER', 'SHIPPER', 'RECEIVER', 'OTHER');

-- CreateEnum
CREATE TYPE "AgreementAcceptanceMethod" AS ENUM ('CLICK_ACCEPT', 'DRAWN_SIGNATURE', 'EXTERNAL_ESIGN');

-- CreateEnum
CREATE TYPE "ExternalTransactionRole" AS ENUM ('BROKER', 'SHIPPER', 'RECEIVER', 'OTHER');

-- CreateTable
CREATE TABLE "load_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "load_id" UUID NOT NULL,
    "type" "LoadEventType" NOT NULL,
    "actor_type" "LoadEventActorType" NOT NULL DEFAULT 'SYSTEM',
    "actor_id" UUID,
    "actor_name" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "load_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "load_charge_opportunities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "load_id" UUID NOT NULL,
    "source_document_id" UUID,
    "type" "LoadChargeOpportunityType" NOT NULL,
    "status" "LoadChargeOpportunityStatus" NOT NULL DEFAULT 'DETECTED',
    "amount" DECIMAL(12,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "load_charge_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "load_id" UUID NOT NULL,
    "type" "AgreementType" NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreement_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "source_document_version_id" UUID,
    "version_number" INTEGER NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "terms" JSONB NOT NULL,
    "total_amount" DECIMAL(12,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agreement_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreement_acceptances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "agreement_version_id" UUID NOT NULL,
    "party_role" "AgreementPartyRole" NOT NULL,
    "method" "AgreementAcceptanceMethod" NOT NULL,
    "accepted_by_name" TEXT NOT NULL,
    "accepted_by_title" TEXT,
    "accepted_by_email" TEXT,
    "consent_text" TEXT NOT NULL,
    "signature_storage_key" TEXT,
    "provider_envelope_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agreement_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_transaction_access" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "load_id" UUID NOT NULL,
    "agreement_id" UUID,
    "token_hash" VARCHAR(64) NOT NULL,
    "recipient_name" TEXT,
    "recipient_email" TEXT,
    "role" "ExternalTransactionRole" NOT NULL,
    "permissions" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_accessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_transaction_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "load_events_organization_id_load_id_occurred_at_idx" ON "load_events"("organization_id", "load_id", "occurred_at");

-- CreateIndex
CREATE INDEX "load_events_organization_id_type_idx" ON "load_events"("organization_id", "type");

-- CreateIndex
CREATE INDEX "load_charge_opportunities_organization_id_load_id_idx" ON "load_charge_opportunities"("organization_id", "load_id");

-- CreateIndex
CREATE INDEX "load_charge_opportunities_organization_id_status_idx" ON "load_charge_opportunities"("organization_id", "status");

-- CreateIndex
CREATE INDEX "load_charge_opportunities_load_id_type_idx" ON "load_charge_opportunities"("load_id", "type");

-- CreateIndex
CREATE INDEX "agreements_organization_id_load_id_idx" ON "agreements"("organization_id", "load_id");

-- CreateIndex
CREATE INDEX "agreements_organization_id_status_idx" ON "agreements"("organization_id", "status");

-- CreateIndex
CREATE INDEX "agreement_versions_organization_id_agreement_id_idx" ON "agreement_versions"("organization_id", "agreement_id");

-- CreateIndex
CREATE INDEX "agreement_versions_organization_id_content_hash_idx" ON "agreement_versions"("organization_id", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "agreement_versions_agreement_id_version_number_key" ON "agreement_versions"("agreement_id", "version_number");

-- CreateIndex
CREATE INDEX "agreement_acceptances_organization_id_accepted_at_idx" ON "agreement_acceptances"("organization_id", "accepted_at");

-- CreateIndex
CREATE UNIQUE INDEX "agreement_acceptances_agreement_version_id_party_role_key" ON "agreement_acceptances"("agreement_version_id", "party_role");

-- CreateIndex
CREATE UNIQUE INDEX "external_transaction_access_token_hash_key" ON "external_transaction_access"("token_hash");

-- CreateIndex
CREATE INDEX "external_transaction_access_organization_id_load_id_idx" ON "external_transaction_access"("organization_id", "load_id");

-- CreateIndex
CREATE INDEX "external_transaction_access_organization_id_role_idx" ON "external_transaction_access"("organization_id", "role");

-- CreateIndex
CREATE INDEX "external_transaction_access_expires_at_idx" ON "external_transaction_access"("expires_at");

-- AddForeignKey
ALTER TABLE "load_events" ADD CONSTRAINT "load_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_events" ADD CONSTRAINT "load_events_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_charge_opportunities" ADD CONSTRAINT "load_charge_opportunities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_charge_opportunities" ADD CONSTRAINT "load_charge_opportunities_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_charge_opportunities" ADD CONSTRAINT "load_charge_opportunities_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_versions" ADD CONSTRAINT "agreement_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_versions" ADD CONSTRAINT "agreement_versions_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_versions" ADD CONSTRAINT "agreement_versions_source_document_version_id_fkey" FOREIGN KEY ("source_document_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_agreement_version_id_fkey" FOREIGN KEY ("agreement_version_id") REFERENCES "agreement_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_transaction_access" ADD CONSTRAINT "external_transaction_access_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_transaction_access" ADD CONSTRAINT "external_transaction_access_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_transaction_access" ADD CONSTRAINT "external_transaction_access_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
