CREATE TYPE "DriverInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED');
CREATE UNIQUE INDEX "drivers_id_organization_id_key" ON "drivers"("id", "organization_id");
CREATE TABLE "driver_invitations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "driver_id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "auth_user_id" UUID,
  "status" "DriverInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "first_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accepted_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "driver_invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "driver_invitations_driver_id_key" ON "driver_invitations"("driver_id");
CREATE UNIQUE INDEX "driver_invitations_driver_id_organization_id_key" ON "driver_invitations"("driver_id", "organization_id");
CREATE UNIQUE INDEX "driver_invitations_auth_user_id_key" ON "driver_invitations"("auth_user_id");
CREATE INDEX "driver_invitations_organization_id_status_idx" ON "driver_invitations"("organization_id", "status");
ALTER TABLE "driver_invitations" ADD CONSTRAINT "driver_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_invitations" ADD CONSTRAINT "driver_invitations_driver_id_organization_id_fkey" FOREIGN KEY ("driver_id", "organization_id") REFERENCES "drivers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_invitations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "driver_invitations" FROM anon, authenticated;
