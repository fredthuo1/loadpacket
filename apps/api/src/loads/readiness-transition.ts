import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { LoadEventsService } from '../load-events/load-events.service';
import { evaluateReadiness } from './readiness-policy';
// Callers use this transaction-scoped transition, never infer readiness from
// the absence of MISSING records. The row lock also serializes retries.
export async function reconcileReadiness(
  tx: Prisma.TransactionClient,
  user: AuthenticatedUser,
  loadId: string,
  events: LoadEventsService,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`,
  );
  const load = await tx.load.findFirst({
    where: { id: loadId, organizationId: user.organizationId },
    include: { requirements: true },
  });
  if (!load) throw new NotFoundException('Load was not found.');
  const readiness = evaluateReadiness(load.requirements);
  let status = load.status;
  if (status === 'DELIVERED' && readiness.ready) {
    await tx.load.update({
      where: { id: loadId, organizationId: user.organizationId },
      data: { status: 'PAYMENT_READY' },
    });
    await events.recordInTransaction(tx, {
      organizationId: user.organizationId,
      loadId,
      type: 'PAYMENT_READY',
      actorType: 'SYSTEM',
      actorId: user.id,
      actorName: `${user.firstName} ${user.lastName}`,
      metadata: {
        previousLoadStatus: 'DELIVERED',
        loadStatus: 'PAYMENT_READY',
        invoiceNumber: load.invoiceNumber,
        blockingCount: 0,
      },
    });
    status = 'PAYMENT_READY';
  }
  return { status, readiness };
}
