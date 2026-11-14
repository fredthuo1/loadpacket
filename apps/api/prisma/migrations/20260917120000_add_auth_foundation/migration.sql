BEGIN;
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'DISPATCHER', 'BACK_OFFICE', 'DRIVER');
CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "auth_user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "role" "UserRole" NOT NULL,
  "first_name" TEXT NOT NULL,
  "last_name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "users"("auth_user_id");
CREATE UNIQUE INDEX "users_id_organization_id_key" ON "users"("id", "organization_id");
CREATE UNIQUE INDEX "users_organization_id_email_key" ON "users"("organization_id", "email");
CREATE INDEX "users_organization_id_role_idx" ON "users"("organization_id", "role");
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drivers" ADD COLUMN "user_id" UUID;
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");
CREATE UNIQUE INDEX "drivers_user_id_organization_id_key" ON "drivers"("user_id", "organization_id");
-- A driver can only link to a User in the same tenant. Unlink before deleting a User.
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business data is accessed through Nest/Prisma, never the Supabase Data API.
-- Supabase's default public-schema grants must not make these tables accessible
-- to browser/mobile publishable keys. RLS with no policies denies those roles.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['organizations','drivers','load_assignments','documents','document_versions','loads','load_stops','load_documents','load_requirements','load_events','load_charge_opportunities','agreements','agreement_versions','agreement_acceptances','external_transaction_access','users']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated', table_name);
    END IF;
  END LOOP;
END $$;
COMMIT;
