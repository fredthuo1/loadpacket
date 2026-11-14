import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

export function digest(value: unknown): string {
  // Canonical object keys make payload fingerprints independent of JSON property order.
  const canonical = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => [k, canonical(x)]),
      );
    return v;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

// Stable throughout a single execution, but invalidated by every correction/reassignment.
export async function driverActionToken(
  tx: Pick<Prisma.TransactionClient, 'loadEvent' | 'loadAssignment'>,
  organizationId: string,
  loadId: string,
  driverId: string,
) {
  const assignment = await tx.loadAssignment.findFirst({
    where: { organizationId, loadId, driverId, status: { not: 'CANCELLED' } },
  });
  if (!assignment)
    throw new ConflictException(
      'This assignment is no longer active. Refresh your loads.',
    );
  const events = await tx.loadEvent.findMany({
    where: {
      organizationId,
      loadId,
      type: {
        in: [
          'DRIVER_ASSIGNED',
          'LOAD_CORRECTED',
          'DRIVER_UNASSIGNED',
          'LOAD_CANCELLED',
        ],
      },
    },
    select: { id: true },
  });
  return digest({
    organizationId,
    loadId,
    driverId,
    id: assignment.id,
    assignedAt: assignment.assignedAt.toISOString(),
    events: events.map((e) => e.id).sort(),
  });
}

export async function requireDriverActionToken(
  tx: Pick<Prisma.TransactionClient, 'loadEvent' | 'loadAssignment'>,
  organizationId: string,
  loadId: string,
  driverId: string,
  token?: string,
) {
  if (
    !token ||
    token !== (await driverActionToken(tx, organizationId, loadId, driverId))
  )
    throw new ConflictException(
      'This load or assignment changed. Refresh the load before trying again. Older app versions must be updated.',
    );
}
