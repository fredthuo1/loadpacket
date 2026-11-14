import type { Prisma } from '../generated/prisma/client';
type ReadinessLoad = Prisma.LoadGetPayload<{
  include: {
    requirements: true;
    stops: true;
    assignments: {
      include: {
        driver: { select: { id: true; firstName: true; lastName: true } };
      };
    };
  };
}>;
import type { AuthenticatedUser } from '../auth/auth.types';
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { evaluateReadiness } from './readiness-policy';

import { LoadStatus } from '../generated/prisma/enums';
import { resolveInvoiceTerms } from './invoice-terms';

@Injectable()
export class PaymentReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async getQueue(currentUser: AuthenticatedUser) {
    const organizationId = currentUser.organizationId;

    const loads = await this.prisma.load.findMany({
      where: {
        organizationId,

        status: {
          in: [LoadStatus.DELIVERED, LoadStatus.PAYMENT_READY],
        },
      },

      include: {
        requirements: true,

        assignments: {
          include: {
            driver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },

        stops: {
          orderBy: {
            sequence: 'asc',
          },
        },
      },

      orderBy: {
        loadNumber: 'asc',
      },
    });

    const company = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { defaultPaymentTermsDays: true },
    });
    return loads.map((load) =>
      this.buildReadiness(load, company?.defaultPaymentTermsDays),
    );
  }

  async getLoadReadiness(currentUser: AuthenticatedUser, loadId: string) {
    const organizationId = currentUser.organizationId;

    const load = await this.prisma.load.findFirst({
      where: {
        id: loadId,
        organizationId,
      },

      include: {
        requirements: true,

        assignments: {
          include: {
            driver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },

        stops: {
          orderBy: {
            sequence: 'asc',
          },
        },
      },
    });

    if (!load) {
      throw new NotFoundException('Load was not found.');
    }

    const company = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { defaultPaymentTermsDays: true },
    });
    return this.buildReadiness(load, company?.defaultPaymentTermsDays);
  }

  private buildReadiness(load: ReadinessLoad, companyTerms?: number | null) {
    const readiness = evaluateReadiness(load.requirements);

    const activeAssignment = load.assignments.find(
      (assignment) => assignment.status !== 'CANCELLED',
    );

    const pickup = load.stops[0] ?? null;

    const delivery = load.stops[load.stops.length - 1] ?? null;

    return {
      load: {
        id: load.id,

        loadNumber: load.loadNumber,

        brokerName: load.brokerName,

        status: load.status,

        totalRate: load.totalRate,
        paymentTermsDays: load.paymentTermsDays,
        paymentDueAt: load.paymentDueAt,
        invoiceIssuedAt: load.invoiceIssuedAt,
        effectivePaymentTermsDays: resolveInvoiceTerms(
          undefined,
          load.paymentTermsDays,
          companyTerms,
        ),

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
      },

      driver: activeAssignment
        ? {
            id: activeAssignment.driver.id,

            name: `${activeAssignment.driver.firstName} ${activeAssignment.driver.lastName}`,

            assignmentStatus: activeAssignment.status,
          }
        : null,

      readiness,
    };
  }
}
