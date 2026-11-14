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
import type { Prisma, LoadAssignment } from '../generated/prisma/client';
import { lockDriver } from '../drivers/driver-lock';
import { AssignDriverDto } from './assign-driver.dto';
import { digest } from './load-action-token';
import { CorrectLoadDto, LoadCommandDto } from './load-management.dto';
import { calculateLoadRate } from './load-rate.util';

export function assignmentSnapshot(a: LoadAssignment | undefined | null) {
  return a
    ? {
        id: a.id,
        driverId: a.driverId,
        status: a.status,
        assignedAt: a.assignedAt.toISOString(),
        acceptedAt: a.acceptedAt?.toISOString() ?? null,
        completedAt: a.completedAt?.toISOString() ?? null,
      }
    : null;
}

@Injectable()
export class LoadManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: LoadEventsService,
  ) {}

  private async state(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    loadId: string,
  ) {
    const load = await tx.load.findFirst({
      where: { id: loadId, organizationId: user.organizationId },
      include: {
        stops: { orderBy: { sequence: 'asc' } },
        assignments: true,
        payments: true,
        documents: true,
        requirements: true,
        financialTransactions: true,
        carrierInvoices: true,
        chargeOpportunities: true,
        agreements: true,
        events: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!load) throw new NotFoundException('Load was not found.');
    const assignment = load.assignments.find((a) => a.status !== 'CANCELLED');
    const financial = !!(
      load.carrierInvoices.length ||
      load.invoiceNumber ||
      load.invoiceIssuedAt ||
      load.billingSubmittedAt ||
      load.paidAt ||
      load.amountPaid?.gt(0) ||
      load.payments.length ||
      load.financialTransactions.length ||
      load.documents.some((d) => d.role === 'CARRIER_INVOICE') ||
      load.requirements.some(
        (r) => r.documentType === 'CARRIER_INVOICE' && r.currentVersionId,
      ) ||
      load.chargeOpportunities.some((c) =>
        ['APPROVED', 'BILLED'].includes(c.status),
      ) ||
      load.agreements.some((a) => a.status === 'EXECUTED')
    );
    const executed = load.stops.some((s) => s.arrivedAt || s.departedAt);
    const pre =
      load.status === 'BOOKED' &&
      !financial &&
      !executed &&
      (!assignment || ['ASSIGNED', 'ACCEPTED'].includes(assignment.status));
    const token = digest(JSON.parse(JSON.stringify(load)));
    return {
      load,
      assignment,
      financial,
      token,
      eligibility: {
        correct: pre && assignment?.status !== 'ACCEPTED',
        unassign: pre && !!assignment,
        cancel: pre,
        reason: financial
          ? 'Issued or approved financial evidence requires an adjustment workflow.'
          : !pre
            ? 'Only booked, pre-execution loads can be changed.'
            : assignment?.status === 'ACCEPTED'
              ? 'Accepted loads may be unassigned or cancelled; unassign before correcting.'
              : 'Pre-execution changes require a reason.',
      },
    };
  }

  async detail(user: AuthenticatedUser, loadId: string) {
    this.authorize(user);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
      const s = await this.state(tx, user, loadId);
      return {
        token: s.token,
        eligibility: s.eligibility,
        load: {
          brokerContact: s.load.brokerContact,
          equipment: s.load.equipment,
          linehaul: s.load.linehaul?.toString() ?? null,
          fuelSurcharge: s.load.fuelSurcharge?.toString() ?? null,
          totalRate: s.load.totalRate.toString(),
          paymentTermsDays: s.load.paymentTermsDays,
          stops: s.load.stops,
        },
        history: s.load.events
          .filter((e) =>
            [
              'LOAD_CORRECTED',
              'DRIVER_UNASSIGNED',
              'LOAD_CANCELLED',
              'DRIVER_ASSIGNED',
            ].includes(e.type),
          )
          .map((e) => ({
            id: e.id,
            type: e.type,
            actorName: e.actorName,
            occurredAt: e.occurredAt,
            metadata: e.metadata,
          })),
      };
    });
  }

  private authorize(user: AuthenticatedUser) {
    if (!['OWNER', 'DISPATCHER'].includes(user.role))
      throw new ForbiddenException(
        'Only Owners and Dispatchers can manage loads.',
      );
  }

  async execute(
    user: AuthenticatedUser,
    loadId: string,
    action: 'correct' | 'unassign' | 'cancel' | 'assign',
    dto: CorrectLoadDto | LoadCommandDto | AssignDriverDto,
  ) {
    this.authorize(user);
    return this.prisma.$transaction(async (tx) => {
      if (action === 'assign')
        await lockDriver(
          tx,
          user.organizationId,
          (dto as AssignDriverDto).driverId,
        );
      await tx.$queryRaw`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
      const s = await this.state(tx, user, loadId);
      const fingerprint = digest({ action, dto });
      const prior = s.load.events.find(
        (e) =>
          (e.metadata as Prisma.JsonObject | null)?.idempotencyKey ===
          dto.idempotencyKey,
      );
      if (prior) {
        const metadata = prior.metadata as Prisma.JsonObject;
        if (prior.actorId !== user.id || metadata.fingerprint !== fingerprint)
          throw new ConflictException(
            'This request key was already used for a different change.',
          );
        return metadata.result;
      }
      if (dto.expectedToken !== s.token)
        throw new ConflictException(
          'The load changed. Refresh and review it before trying again.',
        );
      if (!(action === 'assign' ? s.eligibility.cancel : s.eligibility[action]))
        throw new ConflictException(s.eligibility.reason);
      const before = {
        brokerContact: s.load.brokerContact,
        equipment: s.load.equipment,
        linehaul: s.load.linehaul?.toString() ?? null,
        fuelSurcharge: s.load.fuelSurcharge?.toString() ?? null,
        totalRate: s.load.totalRate.toString(),
        paymentTermsDays: s.load.paymentTermsDays,
        status: s.load.status,
        stops: s.load.stops.map(
          ({
            id,
            type,
            facilityName,
            address,
            appointmentText,
            referenceNumber,
          }) => ({
            id,
            type,
            facilityName,
            address,
            appointmentText,
            referenceNumber,
          }),
        ),
      };
      if (action === 'assign') {
        const driverId = (dto as AssignDriverDto).driverId;
        const driver = await tx.driver.findFirst({
          where: {
            id: driverId,
            organizationId: user.organizationId,
          },
        });
        if (!driver) throw new NotFoundException('Driver was not found.');
        if (driver.status !== 'ACTIVE')
          throw new ConflictException(
            'Choose an active driver in your organization.',
          );
        await tx.loadAssignment.upsert({
          where: {
            organizationId_loadId: {
              organizationId: user.organizationId,
              loadId,
            },
          },
          create: {
            organizationId: user.organizationId,
            loadId,
            driverId,
            status: 'ASSIGNED',
            assignedAt: new Date(),
            acceptedAt: null,
            completedAt: null,
          },
          update: {
            driverId,
            status: 'ASSIGNED',
            assignedAt: new Date(),
            acceptedAt: null,
            completedAt: null,
          },
        });
      } else if (action === 'correct') {
        const c = dto as CorrectLoadDto;
        if (
          ![
            'brokerContact',
            'equipment',
            'linehaul',
            'fuelSurcharge',
            'totalRate',
            'paymentTermsDays',
            'pickup',
            'delivery',
          ].some((k) => Object.hasOwn(c, k))
        )
          throw new BadRequestException('Provide at least one correction.');
        const rateChanged =
          c.linehaul !== undefined ||
          c.fuelSurcharge !== undefined ||
          c.totalRate !== undefined;
        const rate = rateChanged
          ? calculateLoadRate(
              c.linehaul ?? s.load.linehaul,
              c.fuelSurcharge ?? s.load.fuelSurcharge,
              c.totalRate ??
                ((c.linehaul ?? s.load.linehaul) != null &&
                (c.fuelSurcharge ?? s.load.fuelSurcharge) != null
                  ? undefined
                  : s.load.totalRate),
            )
          : {};
        await tx.load.update({
          where: { id: loadId, organizationId: user.organizationId },
          data: {
            brokerContact: c.brokerContact,
            equipment: c.equipment,
            paymentTermsDays: c.paymentTermsDays,
            ...rate,
          },
        });
        for (const [type, change] of [
          ['PICKUP', c.pickup],
          ['DELIVERY', c.delivery],
        ] as const) {
          if (!change) continue;
          const stops = s.load.stops.filter((stop) => stop.type === type);
          if (stops.length !== 1)
            throw new ConflictException(
              'This correction requires exactly one pickup and delivery stop.',
            );
          await tx.loadStop.update({
            where: { id: stops[0].id, organizationId: user.organizationId },
            data: {
              facilityName: change.facilityName,
              address: change.address,
              appointmentText: change.appointmentText,
              referenceNumber: change.referenceNumber,
            },
          });
        }
      } else {
        if (s.assignment)
          await tx.loadAssignment.update({
            where: { id: s.assignment.id, organizationId: user.organizationId },
            data: { status: 'CANCELLED' },
          });
        if (action === 'cancel')
          await tx.load.update({
            where: { id: loadId, organizationId: user.organizationId },
            data: { status: 'CANCELLED' },
          });
      }
      const after = await tx.load.findFirst({
        where: { id: loadId, organizationId: user.organizationId },
        include: { stops: { orderBy: { sequence: 'asc' } } },
      });
      if (!after) throw new NotFoundException('Load was not found.');
      const result = { loadId, action, status: after.status };
      await this.events.recordInTransaction(tx, {
        organizationId: user.organizationId,
        loadId,
        type:
          action === 'assign'
            ? 'DRIVER_ASSIGNED'
            : action === 'correct'
              ? 'LOAD_CORRECTED'
              : action === 'unassign'
                ? 'DRIVER_UNASSIGNED'
                : 'LOAD_CANCELLED',
        actorType: 'OWNER',
        actorId: user.id,
        actorName: `${user.firstName} ${user.lastName}`,
        metadata: {
          schemaVersion: 1,
          reason: dto.reason,
          idempotencyKey: dto.idempotencyKey,
          fingerprint,
          result,
          assignment: assignmentSnapshot(s.assignment),
          driverId:
            action === 'assign'
              ? (dto as AssignDriverDto).driverId
              : (s.assignment?.driverId ?? null),
          before,
          after: JSON.parse(
            JSON.stringify({
              ...before,
              brokerContact: after.brokerContact,
              equipment: after.equipment,
              linehaul: after.linehaul,
              fuelSurcharge: after.fuelSurcharge,
              totalRate: after.totalRate,
              paymentTermsDays: after.paymentTermsDays,
              status: after.status,
              stops: after.stops.map(
                ({
                  id,
                  type,
                  facilityName,
                  address,
                  appointmentText,
                  referenceNumber,
                }) => ({
                  id,
                  type,
                  facilityName,
                  address,
                  appointmentText,
                  referenceNumber,
                }),
              ),
            }),
          ) as Prisma.InputJsonObject,
        },
      });
      return result;
    });
  }
}
