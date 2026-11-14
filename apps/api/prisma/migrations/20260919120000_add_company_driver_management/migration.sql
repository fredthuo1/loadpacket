BEGIN;
ALTER TABLE "organizations"
  ADD COLUMN "dba_name" TEXT,
  ADD COLUMN "mc_number" TEXT,
  ADD COLUMN "usdot_number" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "address_line_1" TEXT,
  ADD COLUMN "address_line_2" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "postal_code" TEXT,
  ADD COLUMN "country" TEXT NOT NULL DEFAULT 'US',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
  ADD COLUMN "default_payment_terms_days" INTEGER NOT NULL DEFAULT 30,
  ADD CONSTRAINT "organizations_payment_terms_range" CHECK ("default_payment_terms_days" BETWEEN 0 AND 365);
ALTER TABLE "drivers"
  ADD COLUMN "cdl_number" TEXT,
  ADD COLUMN "cdl_state" TEXT,
  ADD COLUMN "cdl_expiration_date" DATE,
  ADD COLUMN "hire_date" DATE,
  ADD COLUMN "notes" TEXT;
-- Prisma cannot represent a partial expression index. Keep this constraint in SQL.
-- Existing duplicates cause the transaction to fail safely; never merge/delete drivers.
CREATE UNIQUE INDEX "drivers_active_email_per_organization"
  ON "drivers" ("organization_id", lower(btrim("email")))
  WHERE "status" = 'ACTIVE' AND "email" IS NOT NULL AND btrim("email") <> '';
COMMIT;
