CREATE UNIQUE INDEX "loads_id_organization_id_key" ON "loads"("id", "organization_id");
CREATE TABLE "load_payments" (
 "id" UUID NOT NULL PRIMARY KEY, "organization_id" UUID NOT NULL, "load_id" UUID NOT NULL,
 "amount" DECIMAL(12,2) NOT NULL, "currency" VARCHAR(3) NOT NULL,
 "idempotency_key" VARCHAR(100) NOT NULL, "recorded_by_user_id" UUID,
 "recorded_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "load_payments_positive_amount" CHECK ("amount" > 0),
 CONSTRAINT "load_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "load_payments_load_id_organization_id_fkey" FOREIGN KEY ("load_id", "organization_id") REFERENCES "loads"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "load_payments_recorded_by_user_id_organization_id_fkey" FOREIGN KEY ("recorded_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "load_payments_organization_id_load_id_idempotency_key_key" ON "load_payments"("organization_id", "load_id", "idempotency_key");
CREATE INDEX "load_payments_organization_id_load_id_recorded_at_idx" ON "load_payments"("organization_id", "load_id", "recorded_at");
-- Preserve existing operational values. Unknown historical actors remain null;
-- no historical payment or event is fabricated for a missing amount.
INSERT INTO "load_payments" ("id","organization_id","load_id","amount","currency","idempotency_key","recorded_at")
SELECT gen_random_uuid(),"organization_id","id","amount_paid","currency",'legacy:' || "id"::text,COALESCE("paid_at","updated_at") FROM "loads" WHERE "amount_paid" > 0;
ALTER TABLE "load_payments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "load_payments" FROM anon, authenticated;
