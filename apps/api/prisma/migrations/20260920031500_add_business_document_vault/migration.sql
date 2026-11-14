CREATE TYPE "CompanyDocumentType" AS ENUM ('W9', 'CERTIFICATE_OF_INSURANCE', 'OPERATING_AUTHORITY', 'PERMIT', 'OTHER');
CREATE TYPE "DriverDocumentType" AS ENUM ('CDL', 'MEDICAL_CERTIFICATE', 'MVR', 'OTHER');
CREATE UNIQUE INDEX "documents_id_organization_id_key" ON "documents"("id", "organization_id");
ALTER TABLE "document_versions" ADD COLUMN "uploaded_by_user_id" UUID,
 ADD COLUMN "upload_key" UUID, ADD COLUMN "issued_at" DATE, ADD COLUMN "expires_at" DATE;
CREATE UNIQUE INDEX "document_versions_organization_id_upload_key_key" ON "document_versions"("organization_id", "upload_key");
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_user_id_organization_id_fkey" FOREIGN KEY ("uploaded_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_date_order" CHECK ("issued_at" IS NULL OR "expires_at" IS NULL OR "expires_at" >= "issued_at");
CREATE TABLE "organization_documents" (
 "id" UUID NOT NULL PRIMARY KEY, "organization_id" UUID NOT NULL, "document_id" UUID NOT NULL,
 "type" "CompanyDocumentType" NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "organization_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "organization_documents_document_id_organization_id_fkey" FOREIGN KEY ("document_id", "organization_id") REFERENCES "documents"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "organization_documents_document_id_key" ON "organization_documents"("document_id");
CREATE UNIQUE INDEX "organization_documents_document_id_organization_id_key" ON "organization_documents"("document_id", "organization_id");
CREATE INDEX "organization_documents_organization_id_type_idx" ON "organization_documents"("organization_id", "type");
CREATE TABLE "driver_documents" (
 "id" UUID NOT NULL PRIMARY KEY, "organization_id" UUID NOT NULL, "driver_id" UUID NOT NULL, "document_id" UUID NOT NULL,
 "type" "DriverDocumentType" NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "driver_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "driver_documents_driver_id_organization_id_fkey" FOREIGN KEY ("driver_id", "organization_id") REFERENCES "drivers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "driver_documents_document_id_organization_id_fkey" FOREIGN KEY ("document_id", "organization_id") REFERENCES "documents"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "driver_documents_document_id_key" ON "driver_documents"("document_id");
CREATE UNIQUE INDEX "driver_documents_document_id_organization_id_key" ON "driver_documents"("document_id", "organization_id");
CREATE INDEX "driver_documents_organization_id_driver_id_type_idx" ON "driver_documents"("organization_id", "driver_id", "type");
ALTER TABLE "organization_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "driver_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "organization_documents", "driver_documents" FROM anon, authenticated;
