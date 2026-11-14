import { Prisma } from '../generated/prisma/client';
import {
  processingJson,
  reviewHash,
} from '../documents/document-intelligence.service';
import { evaluateReadiness } from './readiness-policy';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

import {
  DocumentStatus,
  DocumentType,
  LoadEventActorType,
  LoadEventType,
  LoadStatus,
  StopType,
} from '../generated/prisma/enums';

import { LoadEventsService } from '../load-events/load-events.service';

import { AssignDriverDto } from './assign-driver.dto';
import { CreateLoadDto } from './create-load.dto';
import { calculateLoadRate } from './load-rate.util';
import { LoadManagementService } from './load-management.service';

@Injectable()
export class LoadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loadEvents: LoadEventsService,
    private readonly management: LoadManagementService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateLoadDto) {
    if (!dto.processingRunId) {
      return this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM documents WHERE id=${dto.documentId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
        const run = await tx.documentProcessingRun.findFirst({
          where: {
            organizationId: user.organizationId,
            documentId: dto.documentId,
          },
          select: { id: true },
        });
        if (run)
          throw new BadRequestException(
            'Review this document in the current intake screen before creating the load.',
          );
        return this.createLegacy(user, dto, tx);
      });
    }
    if (
      dto.reviewConfirmed !== true ||
      !dto.confirmationKey ||
      dto.currency !== 'USD'
    )
      throw new BadRequestException(
        'Explicit review confirmation, request key and supported USD currency are required.',
      );
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM documents WHERE id=${dto.documentId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM document_processing_runs WHERE id=${dto.processingRunId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
      if (
        !(await tx.user.findFirst({
          where: {
            id: user.id,
            organizationId: user.organizationId,
            active: true,
            role: { in: ['OWNER', 'DISPATCHER'] },
          },
        }))
      )
        throw new ForbiddenException(
          'Current load-creation permission is required.',
        );
      const run = await tx.documentProcessingRun.findFirst({
        where: {
          id: dto.processingRunId,
          organizationId: user.organizationId,
          documentId: dto.documentId,
        },
      });
      if (!run)
        throw new NotFoundException('Processing evidence was not found.');
      const hash = reviewHash(dto);
      if (run.review) {
        const previous = run.review as { requestHash: string };
        if (previous.requestHash !== hash)
          throw new ConflictException(
            'This review already created a load with different confirmed values.',
          );
        const load = await tx.load.findFirstOrThrow({
          where: {
            id: run.createdLoadId!,
            organizationId: user.organizationId,
          },
        });
        return { created: false, load };
      }
      if (!['SUCCEEDED', 'FAILED'].includes(run.status))
        throw new ConflictException(
          'Wait for processing to finish before confirming.',
        );
      const latest = await tx.documentVersion.findFirst({
        where: {
          documentId: dto.documentId,
          organizationId: user.organizationId,
        },
        orderBy: { versionNumber: 'desc' },
      });
      if (
        !latest ||
        latest.id !== run.documentVersionId ||
        latest.checksum !== run.sourceChecksum
      )
        throw new ConflictException(
          'The source version changed. Review the latest document.',
        );
      if (
        await tx.loadDocument.findFirst({
          where: {
            organizationId: user.organizationId,
            documentId: dto.documentId,
            role: DocumentType.RATE_CONFIRMATION,
          },
        })
      )
        throw new ConflictException(
          'This Rate Confirmation is already linked to a load. Open the existing load instead.',
        );
      const result = await this.createLegacy(user, dto, tx);
      const extracted = run.result as {
        fields?: Record<string, { value: unknown }>;
      } | null;
      const accepted = JSON.parse(JSON.stringify(dto)) as Record<
        string,
        unknown
      >;
      const get = (path: string): unknown =>
        path.startsWith('requirements.')
          ? dto.requirements.find((r) => r.documentType === path.split('.')[1])
              ?.requirement
          : path
              .replace(/\.date$/, '.appointment')
              .split('.')
              .reduce<unknown>(
                (v, key) =>
                  v && typeof v === 'object'
                    ? (v as Record<string, unknown>)[key]
                    : undefined,
                accepted,
              );
      const corrections = Object.fromEntries(
        Object.entries(extracted?.fields ?? {}).map(([name, evidence]) => [
          name,
          {
            extracted: evidence.value,
            confirmed: get(name) ?? null,
            state:
              JSON.stringify(evidence.value) ===
              JSON.stringify(get(name) ?? null)
                ? 'CONFIRMED'
                : 'CORRECTED',
          },
        ]),
      );
      await tx.documentProcessingRun.update({
        where: { id: run.id },
        data: {
          review: processingJson({
            version: 1,
            requestHash: hash,
            confirmationKey: dto.confirmationKey,
            sourceChecksum: run.sourceChecksum,
            sourceVersionId: run.documentVersionId,
            accepted,
            corrections,
            manual: run.status === 'FAILED',
          }),
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
          createdLoadId: result.load.id,
        },
      });
      return result;
    });
  }

  private async createLegacy(
    currentUser: AuthenticatedUser,
    dto: CreateLoadDto,
    transaction?: Prisma.TransactionClient,
  ) {
    const db = transaction ?? this.prisma;
    const organizationId = currentUser.organizationId;

    const document = await db.document.findFirst({
      where: {
        id: dto.documentId,

        organizationId,
      },
    });

    if (!document) {
      throw new NotFoundException('Rate Confirmation document was not found.');
    }

    if (document.type !== DocumentType.RATE_CONFIRMATION) {
      throw new BadRequestException(
        'Source document must be a Rate Confirmation.',
      );
    }

    /*
     * Prevent the same RateCon from
     * creating multiple loads.
     */
    const existingLink = await db.loadDocument.findFirst({
      where: {
        organizationId,

        documentId: dto.documentId,

        role: DocumentType.RATE_CONFIRMATION,
      },

      include: {
        load: {
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
        },
      },
    });

    if (existingLink) {
      return {
        created: false,

        load: existingLink.load,
      };
    }

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
        'Rate Confirmation cannot be a load requirement.',
      );
    }

    const rate = calculateLoadRate(
      dto.linehaul,
      dto.fuelSurcharge,
      dto.totalRate,
    );

    const write = async (tx: Prisma.TransactionClient) => {
      const load = await tx.load.create({
        data: {
          organizationId,

          status: LoadStatus.BOOKED,

          loadNumber: dto.loadNumber,

          brokerName: dto.brokerName,

          brokerContact: dto.brokerContact ?? null,

          equipment: dto.equipment ?? null,

          currency: 'USD',
          ...(dto.paymentTermsDays !== undefined
            ? { paymentTermsDays: dto.paymentTermsDays }
            : {}),

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

          documents: {
            create: {
              organizationId,

              documentId: dto.documentId,

              role: DocumentType.RATE_CONFIRMATION,
            },
          },

          requirements: {
            create: dto.requirements.map((requirement) => ({
              organizationId,

              documentType: requirement.documentType,

              requirement: requirement.requirement,
            })),
          },
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

      await tx.document.update({
        where: {
          organizationId: currentUser.organizationId,
          id: dto.documentId,
        },

        data: {
          status: DocumentStatus.CONFIRMED,
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
          source: 'RATE_CONFIRMATION',

          sourceDocumentId: dto.documentId,

          loadNumber: load.loadNumber,

          brokerName: load.brokerName,

          totalRate: load.totalRate.toString(),

          currency: load.currency,
        },
      });

      return {
        created: true,

        load,
      };
    };
    return transaction ? write(transaction) : this.prisma.$transaction(write);
  }

  async getDashboard(currentUser: AuthenticatedUser) {
    const organizationId = currentUser.organizationId;

    const activeStatuses: LoadStatus[] = [
      LoadStatus.BOOKED,
      LoadStatus.IN_TRANSIT,
      LoadStatus.DELIVERED,
      LoadStatus.PAYMENT_READY,
      LoadStatus.INVOICED,
    ];

    const rows = await this.prisma.load.findMany({
      where: { organizationId },
      include: {
        requirements: true,
        stops: { orderBy: { sequence: 'asc' } },
        assignments: { include: { driver: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const activeLoads = rows.filter((load) =>
      activeStatuses.includes(load.status),
    ).length;
    const readyLoads = rows.filter(
      (load) =>
        load.status === 'PAYMENT_READY' &&
        evaluateReadiness(load.requirements).ready,
    );
    const blockedLoads = rows.filter(
      (load) =>
        (load.status === 'DELIVERED' || load.status === 'PAYMENT_READY') &&
        !evaluateReadiness(load.requirements).ready,
    );
    const paymentReady = {
      _sum: {
        totalRate: readyLoads.reduce(
          (sum, load) => sum.plus(load.totalRate.toString()),
          new Prisma.Decimal(0),
        ),
      },
    };
    const blocked = {
      _sum: {
        totalRate: blockedLoads.reduce(
          (sum, load) => sum.plus(load.totalRate.toString()),
          new Prisma.Decimal(0),
        ),
      },
    };
    const needsAttention = blockedLoads.length;
    const recentLoads = rows.slice(0, 10);
    return {
      stats: {
        activeLoads,

        paymentReady: paymentReady._sum.totalRate?.toString() ?? '0.00',

        blocked: blocked._sum.totalRate?.toString() ?? '0.00',

        needsAttention,
      },

      recentLoads: recentLoads.map((load) => {
        const pickup = load.stops.find((stop) => stop.type === StopType.PICKUP);

        const delivery = load.stops.find(
          (stop) => stop.type === StopType.DELIVERY,
        );

        const missingRequiredDocuments = evaluateReadiness(
          load.requirements,
        ).blockers.map((item) => item.type);

        const assignment =
          load.assignments.find((a) => a.status !== 'CANCELLED') ?? null;

        return {
          id: load.id,

          loadNumber: load.loadNumber,

          brokerName: load.brokerName,

          totalRate: load.totalRate.toString(),

          status: load.status,

          pickup: {
            facilityName: pickup?.facilityName ?? null,

            address: pickup?.address ?? null,
          },

          delivery: {
            facilityName: delivery?.facilityName ?? null,

            address: delivery?.address ?? null,
          },

          missingRequiredDocuments,

          driver: assignment
            ? {
                id: assignment.driver.id,

                firstName: assignment.driver.firstName,

                lastName: assignment.driver.lastName,

                status: assignment.status,
              }
            : null,
        };
      }),
    };
  }

  assignDriver(
    currentUser: AuthenticatedUser,
    loadId: string,
    dto: AssignDriverDto,
  ) {
    return this.management.execute(currentUser, loadId, 'assign', dto);
  }

  async findOne(currentUser: AuthenticatedUser, loadId: string) {
    const organizationId = currentUser.organizationId;

    const load = await this.prisma.load.findFirst({
      where: {
        id: loadId,

        organizationId,
      },

      include: {
        stops: {
          orderBy: {
            sequence: 'asc',
          },
        },

        requirements: true,

        documents: {
          include: {
            document: {
              select: {
                id: true,

                type: true,

                status: true,
              },
            },
          },
        },

        assignments: {
          include: {
            driver: {
              select: {
                id: true,

                firstName: true,

                lastName: true,

                phone: true,

                email: true,

                status: true,
              },
            },
          },
        },
      },
    });

    if (!load) {
      throw new NotFoundException('Load was not found.');
    }

    return load;
  }
}
