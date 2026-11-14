ALTER TABLE "load_charge_opportunities" ADD COLUMN "detection_key" VARCHAR(100), ADD COLUMN "evidence" JSONB;
CREATE UNIQUE INDEX "load_charge_opportunities_organization_id_load_id_detection_key_key"
ON "load_charge_opportunities" ("organization_id", "load_id", "detection_key");
