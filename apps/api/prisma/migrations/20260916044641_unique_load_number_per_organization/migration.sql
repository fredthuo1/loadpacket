/*
  Warnings:

  - A unique constraint covering the columns `[organization_id,load_number]` on the table `loads` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "loads_organization_id_load_number_idx";

-- CreateIndex
CREATE UNIQUE INDEX "loads_organization_id_load_number_key" ON "loads"("organization_id", "load_number");
