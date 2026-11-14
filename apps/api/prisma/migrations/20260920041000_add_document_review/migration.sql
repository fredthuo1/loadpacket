ALTER TYPE "RequirementStatus" ADD VALUE 'REJECTED';
ALTER TYPE "LoadEventType" ADD VALUE 'DOCUMENT_REJECTED';
ALTER TYPE "LoadEventType" ADD VALUE 'DOCUMENT_WAIVED';
CREATE UNIQUE INDEX "document_versions_id_organization_id_key" ON "document_versions"("id", "organization_id");
ALTER TABLE "load_requirements" ADD COLUMN "current_version_id" UUID,
 ADD COLUMN "reviewed_version_id" UUID, ADD COLUMN "reviewed_by_user_id" UUID,
 ADD COLUMN "reviewed_at" TIMESTAMP(3), ADD COLUMN "review_reason" VARCHAR(1000);
ALTER TABLE "load_requirements" ADD CONSTRAINT "load_requirements_current_version_id_organization_id_fkey" FOREIGN KEY ("current_version_id", "organization_id") REFERENCES "document_versions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "load_requirements" ADD CONSTRAINT "load_requirements_reviewed_version_id_organization_id_fkey" FOREIGN KEY ("reviewed_version_id", "organization_id") REFERENCES "document_versions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "load_requirements" ADD CONSTRAINT "load_requirements_reviewed_by_user_id_organization_id_fkey" FOREIGN KEY ("reviewed_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
