import { Prisma } from '../generated/prisma/client';

// Assignment and administration take the same tenant-scoped row lock.
// Status checks and writes must happen after this lock, in the same transaction.
export async function lockDriver(
  tx: Prisma.TransactionClient,
  organizationId: string,
  driverId: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM drivers WHERE id = ${driverId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`,
  );
}
export const ACTIVE_ASSIGNMENTS = [
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
] as const;
