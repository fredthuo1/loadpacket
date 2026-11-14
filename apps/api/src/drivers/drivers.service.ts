import type { Prisma } from '../generated/prisma/client';
import {
  driverActionToken,
  requireDriverActionToken,
} from '../loads/load-action-token';
import type { AuthenticatedUser } from '../auth/auth.types';
import { stopActions } from './stop-policy';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

import {
  DocumentType,
  DriverStatus,
  LoadAssignmentStatus,
  LoadEventActorType,
  LoadEventType,
  LoadStatus,
  RequirementLevel,
  RequirementStatus,
  StopType,
} from '../generated/prisma/enums';

import { LoadEventsService } from '../load-events/load-events.service';

const DRIVER_DOCUMENT_TYPES: DocumentType[] = [
  DocumentType.BOL,
  DocumentType.POD,
  DocumentType.LUMPER_RECEIPT,
  DocumentType.SCALE_TICKET,
];

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loadEvents: LoadEventsService,
  ) {}

  async findAll(currentUser: AuthenticatedUser) {
    const organizationId = currentUser.organizationId;

    return this.prisma.driver.findMany({
      where: {
        organizationId,
        status: DriverStatus.ACTIVE,
      },

      orderBy: [
        {
          lastName: 'asc',
        },
        {
          firstName: 'asc',
        },
      ],

      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        status: true,
      },
    });
  }

  async assignmentHistory(user: AuthenticatedUser, driverId: string) {
    await this.requireDriver(user.organizationId, driverId);
    const events = await this.prisma.loadEvent.findMany({
      where: {
        organizationId: user.organizationId,
        type: {
          in: ['DRIVER_ASSIGNED', 'DRIVER_UNASSIGNED', 'LOAD_CANCELLED'],
        },
        metadata: { path: ['assignment', 'driverId'], equals: driverId },
      },
      include: { load: { select: { loadNumber: true } } },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    return events.map((event) => {
      const metadata = event.metadata as {
        assignment: {
          id: string;
          status: string;
          assignedAt: string;
          acceptedAt: string | null;
          completedAt: string | null;
        };
      };
      const a = metadata.assignment;
      return {
        id: event.id,
        loadId: event.loadId,
        loadNumber: event.load.loadNumber,
        endedAt: event.occurredAt,
        outcome:
          event.type === 'LOAD_CANCELLED'
            ? 'CANCELLED'
            : event.type === 'DRIVER_UNASSIGNED'
              ? 'UNASSIGNED'
              : 'REASSIGNED',
        assignedAt: a.assignedAt,
        acceptedAt: a.acceptedAt,
        completedAt: a.completedAt,
      };
    });
  }

  async findAssignedLoads(currentUser: AuthenticatedUser, driverId: string) {
    const organizationId = currentUser.organizationId;

    const driver = await this.requireDriver(organizationId, driverId);

    const assignments = await this.prisma.loadAssignment.findMany({
      where: {
        organizationId,
        driverId,

        status: {
          not: LoadAssignmentStatus.CANCELLED,
        },
      },

      orderBy: {
        assignedAt: 'desc',
      },

      include: {
        load: {
          include: {
            stops: {
              orderBy: {
                sequence: 'asc',
              },
            },

            requirements: {
              where: {
                documentType: {
                  in: DRIVER_DOCUMENT_TYPES,
                },
              },

              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    });

    return {
      driver,

      history: await this.assignmentHistory(currentUser, driverId),
      loads: assignments.map((assignment) => {
        const pickup = assignment.load.stops.find(
          (stop) => stop.type === StopType.PICKUP,
        );

        const delivery = assignment.load.stops.find(
          (stop) => stop.type === StopType.DELIVERY,
        );

        const requiredRequirements = assignment.load.requirements.filter(
          (requirement) =>
            requirement.requirement === RequirementLevel.REQUIRED,
        );

        const optionalRequirements = assignment.load.requirements.filter(
          (requirement) =>
            requirement.requirement === RequirementLevel.CONDITIONAL,
        );

        const requiredCaptured = requiredRequirements.filter(
          (requirement) => requirement.status !== RequirementStatus.MISSING,
        ).length;

        const optionalCaptured = optionalRequirements.filter(
          (requirement) => requirement.status !== RequirementStatus.MISSING,
        ).length;

        return {
          assignment: {
            id: assignment.id,

            status: assignment.status,

            assignedAt: assignment.assignedAt,

            acceptedAt: assignment.acceptedAt,

            completedAt: assignment.completedAt,
          },

          load: {
            id: assignment.load.id,

            loadNumber: assignment.load.loadNumber,

            status: assignment.load.status,

            equipment: assignment.load.equipment,

            pickup: pickup
              ? {
                  facilityName: pickup.facilityName,

                  address: pickup.address,

                  appointmentText: pickup.appointmentText,

                  referenceNumber: pickup.referenceNumber,
                }
              : null,

            delivery: delivery
              ? {
                  facilityName: delivery.facilityName,

                  address: delivery.address,

                  appointmentText: delivery.appointmentText,

                  referenceNumber: delivery.referenceNumber,
                }
              : null,

            paperwork: {
              required: {
                captured: requiredCaptured,

                total: requiredRequirements.length,
              },

              optional: {
                captured: optionalCaptured,

                total: optionalRequirements.length,
              },
            },
          },
        };
      }),
    };
  }

  async findAssignedLoad(
    currentUser: AuthenticatedUser,
    driverId: string,
    loadId: string,
  ) {
    const organizationId = currentUser.organizationId;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`;

      const driver = await this.requireDriver(organizationId, driverId, tx);

      const assignment = await tx.loadAssignment.findFirst({
        where: {
          organizationId,
          driverId,
          loadId,

          status: {
            not: LoadAssignmentStatus.CANCELLED,
          },
        },

        include: {
          load: {
            include: {
              stops: {
                orderBy: {
                  sequence: 'asc',
                },
              },

              requirements: {
                include: {
                  currentVersion: { select: { id: true, documentId: true } },
                },
                where: {
                  documentType: {
                    in: DRIVER_DOCUMENT_TYPES,
                  },
                },

                orderBy: {
                  createdAt: 'asc',
                },
              },
            },
          },
        },
      });

      if (!assignment) {
        throw new NotFoundException(
          'Assigned load was not found for this driver.',
        );
      }

      const pickup = assignment.load.stops.find(
        (stop) => stop.type === StopType.PICKUP,
      );

      const delivery = assignment.load.stops.find(
        (stop) => stop.type === StopType.DELIVERY,
      );

      const actionToken = await driverActionToken(
        tx,
        organizationId,
        loadId,
        driverId,
      );
      return {
        actionToken,
        driver,

        assignment: {
          id: assignment.id,

          status: assignment.status,

          assignedAt: assignment.assignedAt,

          acceptedAt: assignment.acceptedAt,

          completedAt: assignment.completedAt,
        },

        load: {
          id: assignment.load.id,

          loadNumber: assignment.load.loadNumber,

          status: assignment.load.status,

          equipment: assignment.load.equipment,

          pickup: pickup
            ? {
                id: pickup.id,

                facilityName: pickup.facilityName,

                address: pickup.address,

                appointmentText: pickup.appointmentText,

                referenceNumber: pickup.referenceNumber,
              }
            : null,

          delivery: delivery
            ? {
                id: delivery.id,

                facilityName: delivery.facilityName,

                address: delivery.address,

                appointmentText: delivery.appointmentText,

                referenceNumber: delivery.referenceNumber,
              }
            : null,

          requirements: assignment.load.requirements.map((requirement) => ({
            id: requirement.id,

            documentType: requirement.documentType,

            requirement: requirement.requirement,

            status: requirement.status,
            reviewReason: requirement.reviewReason,
            documentId: requirement.currentVersion?.documentId ?? null,
            documentVersionId: requirement.currentVersion?.id ?? null,
          })),
          stops: stopActions(
            assignment.load.stops,
            assignment.load.status,
            assignment.status,
          ).map((stop) => ({
            id: stop.id,
            sequence: stop.sequence,
            type: stop.type,
            facilityName: stop.facilityName,
            address: stop.address,
            appointmentText: stop.appointmentText,
            referenceNumber: stop.referenceNumber,
            arrivedAt: stop.arrivedAt ?? null,
            departedAt: stop.departedAt ?? null,
            allowedAction: stop.allowedAction,
          })),
        },
      };
    });
  }

  async acceptLoad(
    currentUser: AuthenticatedUser,
    driverId: string,
    loadId: string,
    actionToken?: string,
  ) {
    const organizationId = currentUser.organizationId;

    await this.requireDriver(organizationId, driverId);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM loads WHERE id = ${loadId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      const assignment = await tx.loadAssignment.findFirst({
        where: {
          organizationId,
          driverId,
          loadId,
        },

        include: {
          load: {
            select: {
              id: true,
              loadNumber: true,
              status: true,
            },
          },
        },
      });

      if (!assignment) {
        throw new NotFoundException(
          'Assigned load was not found for this driver.',
        );
      }

      await requireDriverActionToken(
        tx,
        organizationId,
        loadId,
        driverId,
        actionToken,
      );
      /*
       * Idempotency:
       * repeated acceptance does not create
       * duplicate timeline events.
       */
      if (assignment.status === LoadAssignmentStatus.ACCEPTED) {
        return {
          assignment: {
            id: assignment.id,

            status: assignment.status,

            acceptedAt: assignment.acceptedAt,
          },

          load: assignment.load,
        };
      }

      if (assignment.status !== LoadAssignmentStatus.ASSIGNED) {
        throw new BadRequestException(
          `Load cannot be accepted while assignment status is ${assignment.status}.`,
        );
      }

      if (assignment.load.status !== LoadStatus.BOOKED) {
        throw new BadRequestException(
          `Load cannot be accepted while load status is ${assignment.load.status}.`,
        );
      }

      const acceptedAt = new Date();

      const updated = await tx.loadAssignment.update({
        where: {
          organizationId: currentUser.organizationId,
          id: assignment.id,
          driverId,
        },

        data: {
          status: LoadAssignmentStatus.ACCEPTED,

          acceptedAt,
        },

        select: {
          id: true,
          status: true,
          acceptedAt: true,
        },
      });

      await this.loadEvents.recordInTransaction(tx, {
        organizationId,
        loadId,

        type: LoadEventType.DRIVER_ACCEPTED,

        actorType:
          currentUser.role === 'DRIVER'
            ? LoadEventActorType.DRIVER
            : LoadEventActorType.OWNER,

        actorId: currentUser.id,

        actorName: `${currentUser.firstName} ${currentUser.lastName}`,

        occurredAt: acceptedAt,

        metadata: {
          assignmentId: assignment.id,

          loadNumber: assignment.load.loadNumber,

          previousAssignmentStatus: LoadAssignmentStatus.ASSIGNED,

          assignmentStatus: LoadAssignmentStatus.ACCEPTED,
        },
      });

      return {
        assignment: {
          id: updated.id,

          status: updated.status,

          acceptedAt: updated.acceptedAt,
        },

        load: assignment.load,
      };
    });
  }

  async startLoad(
    currentUser: AuthenticatedUser,
    driverId: string,
    loadId: string,
    actionToken?: string,
  ) {
    const organizationId = currentUser.organizationId;

    await this.requireDriver(organizationId, driverId);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM loads WHERE id = ${loadId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      const assignment = await tx.loadAssignment.findFirst({
        where: {
          organizationId,
          driverId,
          loadId,
        },

        include: {
          load: {
            select: {
              id: true,
              loadNumber: true,
              status: true,
            },
          },
        },
      });

      if (!assignment) {
        throw new NotFoundException(
          'Assigned load was not found for this driver.',
        );
      }

      await requireDriverActionToken(
        tx,
        organizationId,
        loadId,
        driverId,
        actionToken,
      );
      /*
       * Idempotency:
       * repeated start requests do not
       * create duplicate events.
       */
      if (
        assignment.status === LoadAssignmentStatus.IN_PROGRESS &&
        assignment.load.status === LoadStatus.IN_TRANSIT
      ) {
        return {
          assignment: {
            id: assignment.id,

            status: assignment.status,
          },

          load: assignment.load,
        };
      }

      if (assignment.status !== LoadAssignmentStatus.ACCEPTED) {
        throw new BadRequestException(
          'The driver must accept the load before starting it.',
        );
      }

      if (assignment.load.status !== LoadStatus.BOOKED) {
        throw new BadRequestException(
          `Load cannot be started while status is ${assignment.load.status}.`,
        );
      }

      const startedAt = new Date();

      const updatedAssignment = await tx.loadAssignment.update({
        where: {
          organizationId: currentUser.organizationId,
          id: assignment.id,
          driverId,
        },

        data: {
          status: LoadAssignmentStatus.IN_PROGRESS,
        },

        select: {
          id: true,
          status: true,
        },
      });

      const updatedLoad = await tx.load.update({
        where: { organizationId: currentUser.organizationId, id: loadId },

        data: {
          status: LoadStatus.IN_TRANSIT,
        },

        select: {
          id: true,
          loadNumber: true,
          status: true,
        },
      });

      await this.loadEvents.recordInTransaction(tx, {
        organizationId,
        loadId,

        type: LoadEventType.LOAD_STARTED,

        actorType:
          currentUser.role === 'DRIVER'
            ? LoadEventActorType.DRIVER
            : LoadEventActorType.OWNER,

        actorId: currentUser.id,

        actorName: `${currentUser.firstName} ${currentUser.lastName}`,

        occurredAt: startedAt,

        metadata: {
          assignmentId: assignment.id,

          loadNumber: updatedLoad.loadNumber,

          previousAssignmentStatus: LoadAssignmentStatus.ACCEPTED,

          assignmentStatus: LoadAssignmentStatus.IN_PROGRESS,

          previousLoadStatus: LoadStatus.BOOKED,

          loadStatus: LoadStatus.IN_TRANSIT,
        },
      });

      return {
        assignment: {
          id: updatedAssignment.id,

          status: updatedAssignment.status,
        },

        load: updatedLoad,
      };
    });
  }

  async completeLoad(
    currentUser: AuthenticatedUser,
    driverId: string,
    loadId: string,
    actionToken?: string,
  ) {
    const organizationId = currentUser.organizationId;

    await this.requireDriver(organizationId, driverId);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM loads WHERE id = ${loadId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      const assignment = await tx.loadAssignment.findFirst({
        where: {
          organizationId,
          driverId,
          loadId,
        },

        include: {
          load: {
            select: {
              id: true,
              loadNumber: true,
              status: true,
            },
          },
        },
      });

      if (!assignment) {
        throw new NotFoundException(
          'Assigned load was not found for this driver.',
        );
      }

      await requireDriverActionToken(
        tx,
        organizationId,
        loadId,
        driverId,
        actionToken,
      );
      /*
       * Idempotency:
       * repeated completion does not
       * create duplicate timeline events.
       */
      if (
        assignment.status === LoadAssignmentStatus.COMPLETED &&
        assignment.load.status === LoadStatus.DELIVERED
      ) {
        return {
          assignment: {
            id: assignment.id,

            status: assignment.status,

            completedAt: assignment.completedAt,
          },

          load: assignment.load,
        };
      }

      if (assignment.status !== LoadAssignmentStatus.IN_PROGRESS) {
        throw new BadRequestException(
          'The load must be in progress before it can be completed.',
        );
      }

      if (assignment.load.status !== LoadStatus.IN_TRANSIT) {
        throw new BadRequestException(
          `Load cannot be completed while status is ${assignment.load.status}.`,
        );
      }

      /*
       * Only REQUIRED driver paperwork
       * blocks completion.
       *
       * Conditional lumper or scale
       * documents may remain missing.
       */
      const missingRequiredDocuments = await tx.loadRequirement.findMany({
        where: {
          organizationId,
          loadId,

          documentType: {
            in: DRIVER_DOCUMENT_TYPES,
          },

          requirement: RequirementLevel.REQUIRED,

          status: {
            in: [RequirementStatus.MISSING, RequirementStatus.REJECTED],
          },
        },

        select: {
          documentType: true,
        },
      });

      if (missingRequiredDocuments.length > 0) {
        const missingNames = missingRequiredDocuments
          .map((requirement) => requirement.documentType)
          .join(', ');

        throw new BadRequestException(
          `Required driver paperwork is still missing: ${missingNames}.`,
        );
      }

      const completedAt = new Date();

      const updatedAssignment = await tx.loadAssignment.update({
        where: {
          organizationId: currentUser.organizationId,
          id: assignment.id,
          driverId,
        },

        data: {
          status: LoadAssignmentStatus.COMPLETED,

          completedAt,
        },

        select: {
          id: true,
          status: true,
          completedAt: true,
        },
      });

      const updatedLoad = await tx.load.update({
        where: { organizationId: currentUser.organizationId, id: loadId },

        data: {
          status: LoadStatus.DELIVERED,
        },

        select: {
          id: true,
          loadNumber: true,
          status: true,
        },
      });

      await this.loadEvents.recordInTransaction(tx, {
        organizationId,
        loadId,

        type: LoadEventType.LOAD_COMPLETED,

        actorType:
          currentUser.role === 'DRIVER'
            ? LoadEventActorType.DRIVER
            : LoadEventActorType.OWNER,

        actorId: currentUser.id,

        actorName: `${currentUser.firstName} ${currentUser.lastName}`,

        occurredAt: completedAt,

        metadata: {
          assignmentId: assignment.id,

          loadNumber: updatedLoad.loadNumber,

          previousAssignmentStatus: LoadAssignmentStatus.IN_PROGRESS,

          assignmentStatus: LoadAssignmentStatus.COMPLETED,

          previousLoadStatus: LoadStatus.IN_TRANSIT,

          loadStatus: LoadStatus.DELIVERED,

          requiredPaperworkComplete: true,
        },
      });

      return {
        assignment: updatedAssignment,

        load: updatedLoad,
      };
    });
  }

  private async requireDriver(
    organizationId: string,
    driverId: string,
    db: Pick<Prisma.TransactionClient, 'driver'> = this.prisma,
  ) {
    const driver = await db.driver.findFirst({
      where: {
        id: driverId,

        organizationId,

        status: DriverStatus.ACTIVE,
      },

      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        status: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Active driver was not found.');
    }

    return driver;
  }
}
