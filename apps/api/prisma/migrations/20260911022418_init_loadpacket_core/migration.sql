-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('RATE_CONFIRMATION', 'BOL', 'POD', 'CARRIER_INVOICE', 'LUMPER_RECEIPT', 'SCALE_TICKET', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'TEXT_EXTRACTED', 'REVIEW_REQUIRED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "LoadStatus" AS ENUM ('BOOKED', 'IN_TRANSIT', 'DELIVERED', 'PAYMENT_READY', 'INVOICED', 'PAID');

-- CreateEnum
CREATE TYPE "StopType" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "RequirementLevel" AS ENUM ('REQUIRED', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('MISSING', 'RECEIVED', 'ACCEPTED', 'WAIVED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loads" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" "LoadStatus" NOT NULL DEFAULT 'BOOKED',
    "load_number" TEXT NOT NULL,
    "broker_name" TEXT NOT NULL,
    "broker_contact" TEXT,
    "equipment" TEXT,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "linehaul" DECIMAL(12,2),
    "fuel_surcharge" DECIMAL(12,2),
    "total_rate" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "load_stops" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "load_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "StopType" NOT NULL,
    "facility_name" TEXT,
    "address" TEXT NOT NULL,
    "appointment_text" TEXT,
    "reference_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "load_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "load_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "load_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "role" "DocumentType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "load_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "load_requirements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "load_id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "requirement" "RequirementLevel" NOT NULL,
    "status" "RequirementStatus" NOT NULL DEFAULT 'MISSING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "load_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_organization_id_idx" ON "documents"("organization_id");

-- CreateIndex
CREATE INDEX "document_versions_organization_id_checksum_idx" ON "document_versions"("organization_id", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_organization_id_storage_key_key" ON "document_versions"("organization_id", "storage_key");

-- CreateIndex
CREATE INDEX "loads_organization_id_load_number_idx" ON "loads"("organization_id", "load_number");

-- CreateIndex
CREATE INDEX "loads_organization_id_status_idx" ON "loads"("organization_id", "status");

-- CreateIndex
CREATE INDEX "load_stops_organization_id_load_id_idx" ON "load_stops"("organization_id", "load_id");

-- CreateIndex
CREATE UNIQUE INDEX "load_stops_load_id_sequence_key" ON "load_stops"("load_id", "sequence");

-- CreateIndex
CREATE INDEX "load_documents_organization_id_load_id_idx" ON "load_documents"("organization_id", "load_id");

-- CreateIndex
CREATE UNIQUE INDEX "load_documents_organization_id_load_id_document_id_role_key" ON "load_documents"("organization_id", "load_id", "document_id", "role");

-- CreateIndex
CREATE INDEX "load_requirements_organization_id_load_id_idx" ON "load_requirements"("organization_id", "load_id");

-- CreateIndex
CREATE INDEX "load_requirements_organization_id_status_idx" ON "load_requirements"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "load_requirements_load_id_document_type_key" ON "load_requirements"("load_id", "document_type");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loads" ADD CONSTRAINT "loads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_stops" ADD CONSTRAINT "load_stops_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_stops" ADD CONSTRAINT "load_stops_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_documents" ADD CONSTRAINT "load_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_documents" ADD CONSTRAINT "load_documents_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_documents" ADD CONSTRAINT "load_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_requirements" ADD CONSTRAINT "load_requirements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_requirements" ADD CONSTRAINT "load_requirements_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
