import type { AuthenticatedUser } from '../auth/auth.types';
import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

import {
  DocumentType,
  LoadEventActorType,
  LoadEventType,
  LoadStatus,
  StopType,
} from '../generated/prisma/enums';

import { LoadEventsService } from '../load-events/load-events.service';

import { CreateManualLoadDto } from './create-manual-load.dto';
import { calculateLoadRate } from './load-rate.util';

@Injectable()
export class ManualLoadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loadEvents: LoadEventsService,
  ) {}

  async create(currentUser: AuthenticatedUser, dto: CreateManualLoadDto) {
    const organizationId = currentUser.organizationId;

    const requirementTypes = dto.requirements.map(
      (requirement) => requirement.documentType,
    );

    if (new Set(requirementTypes).size !== requirementTypes.length) {
      throw new BadRequestException(
        'Duplicate document requirements are not allowed.',
      );
    }

    if (requirementTypes.includes(DocumentType.RATE_CONFIRMATION)) {
      throw new BadRequestException(
        'Rate Confirmation cannot be a manual load requirement.',
      );
    }

    const rate = calculateLoadRate(
      dto.linehaul,
      dto.fuelSurcharge,
      dto.totalRate,
    );

    return this.prisma.$transaction(async (tx) => {
      const load = await tx.load.create({
        data: {
          organizationId,

          status: LoadStatus.BOOKED,

          loadNumber: dto.loadNumber,

          brokerName: dto.brokerName,

          brokerContact: dto.brokerContact ?? null,

          equipment: dto.equipment ?? null,

          currency: 'USD',

          linehaul: rate.linehaul,

          fuelSurcharge: rate.fuelSurcharge,

          totalRate: rate.totalRate,

          stops: {
            create: [
              {
                organizationId,

                sequence: 1,

                type: StopType.PICKUP,

                facilityName: dto.pickup.facilityName,

                address: dto.pickup.address,

                appointmentText: dto.pickup.appointment ?? null,

                referenceNumber: dto.pickup.referenceNumber ?? null,
              },

              {
                organizationId,

                sequence: 2,

                type: StopType.DELIVERY,

                facilityName: dto.delivery.facilityName,

                address: dto.delivery.address,

                appointmentText: dto.delivery.appointment ?? null,

                referenceNumber: dto.delivery.referenceNumber ?? null,
              },
            ],
          },

          requirements:
            dto.requirements.length > 0
              ? {
                  create: dto.requirements.map((requirement) => ({
                    organizationId,

                    documentType: requirement.documentType,

                    requirement: requirement.requirement,
                  })),
                }
              : undefined,
        },

        include: {
          stops: {
            orderBy: {
              sequence: 'asc',
            },
          },

          requirements: true,

          documents: true,

          assignments: {
            include: {
              driver: true,
            },
          },
        },
      });

      await this.loadEvents.recordInTransaction(tx, {
        actorId: currentUser.id,
        actorName: `${currentUser.firstName} ${currentUser.lastName}`,
        organizationId,

        loadId: load.id,

        type: LoadEventType.LOAD_CREATED,

        actorType: LoadEventActorType.OWNER,

        metadata: {
          source: 'MANUAL',

          loadNumber: load.loadNumber,

          brokerName: load.brokerName,

          totalRate: load.totalRate.toString(),

          currency: load.currency,
        },
      });

      return {
        created: true,

        source: 'MANUAL',

        load,
      };
    });
  }
}
