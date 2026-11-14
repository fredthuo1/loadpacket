import { Prisma } from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

import { LoadStatus } from '../generated/prisma/enums';

import { AutopilotService } from './autopilot.service';

const ACTIVE_LOAD_STATUSES: LoadStatus[] = [
  LoadStatus.BOOKED,
  LoadStatus.IN_TRANSIT,
  LoadStatus.DELIVERED,
  LoadStatus.PAYMENT_READY,
  LoadStatus.INVOICED,
];

const OWNER_EXCEPTION_ACTIONS = new Set([
  'ASSIGN_DRIVER',
  'RESOLVE_DOCUMENT_BLOCKERS',
  'GENERATE_CARRIER_INVOICE',
  'CONTINUE_BACK_OFFICE',
  'SUBMIT_BILLING',
]);

@Injectable()
export class OwnerAutopilotService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly autopilot: AutopilotService,
  ) {}

  async getExceptions(currentUser: AuthenticatedUser) {
    const organizationId = currentUser.organizationId;

    /*
     * Start with only active loads.
     *
     * PAID loads do not belong in
     * the operational exception inbox.
     */
    const loads = await this.prisma.load.findMany({
      where: {
        organizationId,

        status: {
          in: ACTIVE_LOAD_STATUSES,
        },
      },

      select: {
        id: true,

        createdAt: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });

    /*
     * For the MVP we intentionally reuse
     * the exact same deterministic
     * Autopilot engine used by the
     * Driver Load Packet.
     *
     * This prevents the owner dashboard
     * from developing a second set of
     * business rules.
     */
    const results = await Promise.all(
      loads.map((load) =>
        this.autopilot.getLoadAutopilot(currentUser, load.id),
      ),
    );

    const exceptions = results
      .filter(
        (result) =>
          OWNER_EXCEPTION_ACTIONS.has(result.ownerAction.type) ||
          result.moneyOpportunities.length > 0,
      )
      .map((result) => {
        const blockingDocuments = result.readiness.blockers.map(
          (requirement) => requirement.type,
        );

        const moneyFound = result.moneyOpportunities.reduce(
          (total, opportunity) =>
            total.plus(this.moneyValue(opportunity.amount)),
          new Prisma.Decimal(0),
        );

        return {
          load: {
            id: result.load.id,

            loadNumber: result.load.loadNumber,

            status: result.load.status,

            brokerName: result.load.brokerName,

            totalRate: result.load.totalRate,

            currency: result.load.currency,
          },

          driver: result.driver
            ? {
                id: result.driver.id,

                name: result.driver.name,

                assignmentStatus: result.driver.assignmentStatus,
              }
            : null,

          action: {
            type: result.ownerAction.type,

            priority: result.ownerAction.priority,

            label: result.ownerAction.label,

            message: result.ownerAction.message,
          },

          blockingDocuments,

          blockedByPaperwork:
            result.ownerAction.type === 'RESOLVE_DOCUMENT_BLOCKERS',

          moneyOpportunities: result.moneyOpportunities,

          moneyFound: moneyFound.toFixed(2),
        };
      });

    /*
     * Put actionable HIGH priority
     * exceptions at the top.
     *
     * Preserve source ordering inside
     * the same priority.
     */
    const orderedExceptions = exceptions
      .map((exception, index) => ({
        exception,
        index,
      }))
      .sort((left, right) => {
        const priorityDifference =
          this.priorityScore(right.exception.action.priority) -
          this.priorityScore(left.exception.action.priority);

        if (priorityDifference !== 0) {
          return priorityDifference;
        }

        return left.index - right.index;
      })
      .map(({ exception }) => exception);

    const revenueNeedingAttention = orderedExceptions.reduce(
      (total, exception) =>
        total.plus(this.moneyValue(exception.load.totalRate)),
      new Prisma.Decimal(0),
    );

    const blockedByPaperwork = orderedExceptions.reduce((total, exception) => {
      if (!exception.blockedByPaperwork) {
        return total;
      }

      return total.plus(this.moneyValue(exception.load.totalRate));
    }, new Prisma.Decimal(0));

    const moneyFound = orderedExceptions.reduce(
      (total, exception) => total.plus(this.moneyValue(exception.moneyFound)),
      new Prisma.Decimal(0),
    );

    return {
      generatedAt: new Date(),

      summary: {
        needsAttention: orderedExceptions.length,

        revenueNeedingAttention: revenueNeedingAttention.toFixed(2),

        blockedByPaperwork: blockedByPaperwork.toFixed(2),

        moneyFound: moneyFound.toFixed(2),
      },

      exceptions: orderedExceptions,
    };
  }

  private priorityScore(priority: string) {
    switch (priority) {
      case 'HIGH':
        return 3;

      case 'NORMAL':
        return 2;

      case 'LOW':
        return 1;

      default:
        return 0;
    }
  }

  private moneyValue(value: string | null | undefined) {
    return new Prisma.Decimal(value ?? '0');
  }
}
