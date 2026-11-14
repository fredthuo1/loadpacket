import type { AuthenticatedUser } from '../auth/auth.types';
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { evaluateReadiness, requirementApplies } from './readiness-policy';
import { VaultService, documentExpiration } from '../documents/vault.service';

import {
  DriverStatus,
  LoadAssignmentStatus,
  LoadStatus,
} from '../generated/prisma/enums';

@Injectable()
export class OwnerDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
  ) {}

  async getDashboard(currentUser: AuthenticatedUser) {
    const organizationId = currentUser.organizationId;

    const [
      totalLoads,
      totalLoadValue,
      activeLoads,
      paymentReadyLoads,
      outstandingReceivables,
      paidRevenue,
      activeDrivers,
      recentLoads,
    ] = await this.prisma.$transaction([
      this.prisma.load.count({
        where: {
          organizationId,
        },
      }),

      this.prisma.load.aggregate({
        where: {
          organizationId,
        },

        _sum: {
          totalRate: true,
        },
      }),

      this.prisma.load.count({
        where: {
          organizationId,

          status: {
            in: [LoadStatus.BOOKED, LoadStatus.IN_TRANSIT],
          },
        },
      }),

      this.prisma.load.findMany({
        where: {
          organizationId,
          status: LoadStatus.PAYMENT_READY,
        },
        include: { requirements: true },
      }),

      this.prisma.load.aggregate({
        where: {
          organizationId,
          status: LoadStatus.INVOICED,
        },

        _sum: {
          totalRate: true,
          amountPaid: true,
        },

        _count: {
          _all: true,
        },
      }),

      this.prisma.load.aggregate({
        where: {
          organizationId,
          status: LoadStatus.PAID,
        },

        _sum: {
          amountPaid: true,
        },

        _count: {
          _all: true,
        },
      }),

      this.prisma.driver.count({
        where: {
          organizationId,
          status: DriverStatus.ACTIVE,
        },
      }),

      this.prisma.load.findMany({
        where: {
          organizationId,
        },

        orderBy: {
          updatedAt: 'desc',
        },

        take: 8,

        include: {
          stops: {
            orderBy: {
              sequence: 'asc',
            },
          },

          assignments: {
            include: {
              driver: true,
            },
          },

          requirements: true,
        },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      operations: await this.operations(currentUser),

      metrics: {
        totalLoads,

        totalLoadValue: totalLoadValue._sum.totalRate?.toString() ?? '0',

        activeLoads,

        paymentReadyLoads: paymentReadyLoads.filter(
          (load) => evaluateReadiness(load.requirements).ready,
        ).length,

        outstandingReceivables: {
          amount: new Prisma.Decimal(
            outstandingReceivables._sum.totalRate?.toString() ?? '0',
          )
            .minus(outstandingReceivables._sum.amountPaid?.toString() ?? '0')
            .toFixed(2),

          count: outstandingReceivables._count._all,
        },

        paidRevenue: {
          amount: paidRevenue._sum.amountPaid?.toString() ?? '0',

          count: paidRevenue._count._all,
        },

        activeDrivers,
      },

      recentLoads: recentLoads.map((load) => {
        const pickup = load.stops[0] ?? null;

        const delivery =
          load.stops.length > 0 ? load.stops[load.stops.length - 1] : null;

        const assignment =
          load.assignments.find(
            (item) => item.status !== LoadAssignmentStatus.CANCELLED,
          ) ?? null;

        const policy = evaluateReadiness(load.requirements);
        const required = load.requirements.filter(requirementApplies);
        const blocking = policy.blockers;

        return {
          id: load.id,

          loadNumber: load.loadNumber,

          brokerName: load.brokerName,

          status: load.status,

          totalRate: load.totalRate.toString(),

          pickup: pickup
            ? {
                facilityName: pickup.facilityName,

                address: pickup.address,
              }
            : null,

          delivery: delivery
            ? {
                facilityName: delivery.facilityName,

                address: delivery.address,
              }
            : null,

          driver: assignment
            ? {
                id: assignment.driver.id,

                name: `${assignment.driver.firstName} ${assignment.driver.lastName}`.trim(),

                assignmentStatus: assignment.status,
              }
            : null,

          paperwork: {
            requiredCount: required.length,

            blockingCount: blocking.length,

            clear: policy.ready,
          },

          invoiceNumber: load.invoiceNumber,

          paymentDueAt: load.paymentDueAt,

          paidAt: load.paidAt,
        };
      }),
    };
  }

  private async operations(user: AuthenticatedUser) {
    const organizationId = user.organizationId;
    const owner = user.role === 'OWNER';
    const [drivers, documents, loads, invoices, events, opportunities] =
      await Promise.all([
        this.prisma.driver.findMany({
          where: { organizationId },
          include: { invitation: true },
        }),
        this.vault.list(user),
        this.prisma.load.findMany({
          where: {
            organizationId,
            status: {
              in: ['BOOKED', 'IN_TRANSIT', 'DELIVERED', 'PAYMENT_READY'],
            },
          },
          include: { requirements: true },
        }),
        owner
          ? this.prisma.load.findMany({
              where: { organizationId, status: 'INVOICED' },
            })
          : Promise.resolve([]),
        this.prisma.loadEvent.findMany({
          where: { organizationId },
          orderBy: { occurredAt: 'desc' },
          take: 12,
        }),
        owner
          ? this.prisma.loadChargeOpportunity.findMany({
              where: {
                organizationId,
                status: { in: ['DETECTED', 'APPROVED'] },
              },
            })
          : Promise.resolve([]),
      ]);
    const active = drivers.filter((driver) => driver.status === 'ACTIVE');
    const blocked = loads.filter(
      (load) => !evaluateReadiness(load.requirements).ready,
    );
    const now = new Date();
    const overdue = invoices.filter(
      (load) => load.paymentDueAt && load.paymentDueAt < now,
    );
    const remaining = (load: (typeof invoices)[number]) =>
      Prisma.Decimal.max(
        0,
        new Prisma.Decimal(load.totalRate.toString()).minus(
          load.amountPaid?.toString() ?? '0',
        ),
      );
    return {
      drivers: {
        active: active.length,
        inactive: drivers.length - active.length,
        invitePending: drivers.filter(
          (driver) => driver.invitation?.status === 'PENDING',
        ).length,
      },
      attention: {
        awaitingReview: loads.reduce(
          (sum, load) =>
            sum +
            load.requirements.filter(
              (requirement) => requirement.status === 'RECEIVED',
            ).length,
          0,
        ),
        blockedLoads: blocked.length,
        expiringDocuments: documents.filter(
          (document) => document.expiration === 'EXPIRING_SOON',
        ).length,
        expiredDocuments: documents.filter(
          (document) => document.expiration === 'EXPIRED',
        ).length,
        driverComplianceIssues: owner
          ? active.filter((driver) => {
              const own = documents.filter(
                (document) =>
                  document.context === 'DRIVER' &&
                  document.ownerId === driver.id,
              );
              return (
                documentExpiration(driver.cdlExpirationDate) === 'EXPIRED' ||
                ['CDL', 'MEDICAL_CERTIFICATE'].some(
                  (type) =>
                    !own.some(
                      (document) =>
                        document.type === type &&
                        ['VALID', 'EXPIRING_SOON'].includes(
                          document.expiration,
                        ),
                    ),
                )
              );
            }).length
          : null,
      },
      receivables: owner
        ? {
            partialCount: invoices.filter(
              (load) =>
                new Prisma.Decimal(load.amountPaid?.toString() ?? '0').gt(0) &&
                remaining(load).gt(0),
            ).length,
            overdueCount: overdue.length,
            overdueAmount: overdue
              .reduce(
                (sum, load) => sum.plus(remaining(load)),
                new Prisma.Decimal(0),
              )
              .toFixed(2),
          }
        : null,
      moneyFound: owner
        ? {
            count: opportunities.length,
            amount: opportunities
              .reduce(
                (sum, item) => sum.plus(item.amount?.toString() ?? '0'),
                new Prisma.Decimal(0),
              )
              .toFixed(2),
          }
        : null,
      recentActivity: events
        .filter(
          (event) =>
            owner ||
            ![
              'PAYMENT_RECEIVED',
              'BILLING_SUBMITTED',
              'CHARGE_OPPORTUNITY_APPROVED',
              'CHARGE_OPPORTUNITY_BILLED',
            ].includes(event.type),
        )
        .slice(0, 8)
        .map((event) => ({
          id: event.id,
          loadId: event.loadId,
          type: event.type,
          actorName: event.actorName,
          occurredAt: event.occurredAt,
        })),
    };
  }

  async getLoadOverview(currentUser: AuthenticatedUser, loadId: string) {
    const organizationId = currentUser.organizationId;

    const [load, availableDrivers] = await this.prisma.$transaction([
      this.prisma.load.findFirst({
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

          assignments: {
            orderBy: {
              createdAt: 'desc',
            },

            include: {
              driver: true,
            },
          },

          requirements: true,
        },
      }),

      this.prisma.driver.findMany({
        where: {
          organizationId,
          status: DriverStatus.ACTIVE,
        },

        orderBy: [
          {
            firstName: 'asc',
          },
          {
            lastName: 'asc',
          },
        ],
      }),
    ]);

    if (!load) {
      throw new NotFoundException('Load was not found.');
    }

    const assignment =
      load.assignments.find(
        (item) => item.status !== LoadAssignmentStatus.CANCELLED,
      ) ?? null;

    const policy = evaluateReadiness(load.requirements);
    const required = load.requirements.filter(requirementApplies);
    const blocking = policy.blockers;

    return {
      load: {
        id: load.id,

        loadNumber: load.loadNumber,

        status: load.status,

        brokerName: load.brokerName,

        brokerContact: load.brokerContact,

        equipment: load.equipment,

        currency: load.currency,

        linehaul: load.linehaul?.toString() ?? null,

        fuelSurcharge: load.fuelSurcharge?.toString() ?? null,

        totalRate: load.totalRate.toString(),

        createdAt: load.createdAt,

        updatedAt: load.updatedAt,
      },

      route: {
        stops: load.stops.map((stop) => ({
          id: stop.id,

          sequence: stop.sequence,

          type: stop.type,

          facilityName: stop.facilityName,

          address: stop.address,

          appointmentText: stop.appointmentText,

          referenceNumber: stop.referenceNumber,
        })),
      },

      driver: assignment
        ? {
            id: assignment.driver.id,

            name: `${assignment.driver.firstName} ${assignment.driver.lastName}`.trim(),

            phone: assignment.driver.phone,

            email: assignment.driver.email,

            assignmentStatus: assignment.status,

            assignedAt: assignment.createdAt,
          }
        : null,

      paperwork: {
        requiredCount: required.length,

        blockingCount: blocking.length,

        ready: policy.ready,
        blockers: policy.blockers,

        requirements: load.requirements.map((requirement) => ({
          id: requirement.id,

          documentType: requirement.documentType,

          requirement: requirement.requirement,

          status: requirement.status,

          blocking: policy.blockers.some(
            (blocker) => blocker.requirementId === requirement.id,
          ),
        })),
      },

      billing: {
        invoiceNumber: load.invoiceNumber,

        invoiceIssuedAt: load.invoiceIssuedAt,

        billingSubmittedAt: load.billingSubmittedAt,

        paymentTermsDays: load.paymentTermsDays,

        paymentDueAt: load.paymentDueAt,

        billingRecipientName: load.billingRecipientName,

        billingRecipientEmail: load.billingRecipientEmail,

        amountPaid: load.amountPaid?.toString() ?? null,

        paidAt: load.paidAt,

        balanceDue:
          load.status === LoadStatus.INVOICED
            ? Prisma.Decimal.max(
                0,
                new Prisma.Decimal(load.totalRate.toString()).minus(
                  load.amountPaid?.toString() ?? '0',
                ),
              ).toFixed(2)
            : '0',
      },

      availableDrivers: availableDrivers.map((driver) => ({
        id: driver.id,

        name: `${driver.firstName} ${driver.lastName}`.trim(),

        phone: driver.phone,

        email: driver.email,
      })),
    };
  }
}
