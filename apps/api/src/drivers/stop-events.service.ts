import { requireDriverActionToken } from '../loads/load-action-token';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { LoadEventsService } from '../load-events/load-events.service';
import type { LoadEventType } from '../generated/prisma/enums';
import { StopEventDto } from './stop-event.dto';
import { stopActions } from './stop-policy';

@Injectable()
export class StopEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: LoadEventsService,
  ) {}
  async record(
    user: AuthenticatedUser,
    loadId: string,
    stopId: string,
    action: 'arrive' | 'depart',
    location: StopEventDto,
  ) {
    if (user.role !== 'DRIVER' || !user.driverId)
      throw new ForbiddenException('An active driver mapping is required.');
    const hasLatitude = location.latitude != null;
    const hasLongitude = location.longitude != null;
    if (hasLatitude !== hasLongitude)
      throw new BadRequestException(
        'Latitude and longitude must be supplied together.',
      );
    if (
      !hasLatitude &&
      (location.accuracyMeters != null || location.capturedAt != null)
    )
      throw new BadRequestException('Location details require coordinates.');
    const organizationId = user.organizationId;
    return this.prisma.$transaction(async (tx) => {
      // Serialize all stop transitions with accept/start/complete and assignment changes.
      await tx.$queryRaw`SELECT id FROM loads WHERE id = ${loadId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      const driver = await tx.driver.findFirst({
        where: {
          id: user.driverId!,
          organizationId,
          userId: user.id,
          status: 'ACTIVE',
        },
      });
      if (!driver)
        throw new ForbiddenException('An active driver mapping is required.');
      const assignment = await tx.loadAssignment.findFirst({
        where: {
          organizationId,
          loadId,
          driverId: driver.id,
          status: { not: 'CANCELLED' },
        },
        include: { load: true },
      });
      if (!assignment)
        throw new NotFoundException(
          'Assigned load was not found for this driver.',
        );
      await requireDriverActionToken(
        tx,
        organizationId,
        loadId,
        driver.id,
        location.actionToken,
      );
      const stops = await tx.loadStop.findMany({
        where: { organizationId, loadId },
        orderBy: { sequence: 'asc' },
      });
      const stop = stops.find((item) => item.id === stopId);
      if (!stop)
        throw new NotFoundException('Stop was not found for this load.');
      const timestamp = action === 'arrive' ? stop.arrivedAt : stop.departedAt;
      // Authorized retries return the original evidence, even after later progression.
      if (timestamp)
        return {
          stop: {
            id: stop.id,
            arrivedAt: stop.arrivedAt,
            departedAt: stop.departedAt,
          },
          duplicate: true,
        };
      const permitted = stopActions(
        stops,
        assignment.load.status,
        assignment.status,
      ).find((item) => item.id === stopId);
      if (permitted?.allowedAction !== action)
        throw new ConflictException(
          'Start the load, then record arrival and departure for each stop in sequence. Refresh this load before trying again.',
        );
      const occurredAt = new Date();
      const updated = await tx.loadStop.update({
        where: { id: stopId, organizationId, loadId },
        data:
          action === 'arrive'
            ? { arrivedAt: occurredAt }
            : { departedAt: occurredAt },
        select: { id: true, arrivedAt: true, departedAt: true },
      });
      const type =
        `${action === 'arrive' ? 'ARRIVED' : 'DEPARTED'}_${stop.type}` as LoadEventType;
      await this.events.recordInTransaction(tx, {
        organizationId,
        loadId,
        type,
        actorType: 'DRIVER',
        actorId: user.id,
        actorName: `${user.firstName} ${user.lastName}`,
        occurredAt,
        metadata: {
          stopId,
          sequence: stop.sequence,
          assignmentId: assignment.id,
          locationAvailable: hasLatitude,
          latitude: location.latitude ?? null,
          longitude: location.longitude ?? null,
          accuracyMeters: location.accuracyMeters ?? null,
          capturedAt: location.capturedAt ?? null,
        },
      });
      return { stop: updated, duplicate: false };
    });
  }
}
