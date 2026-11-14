import type {
  LoadChargeOpportunity,
  Document,
  DocumentVersion,
} from '../generated/prisma/client';
type OpportunityView = LoadChargeOpportunity & {
  sourceDocument?:
    | (Pick<Document, 'id' | 'type'> & {
        versions?: Pick<DocumentVersion, 'originalFileName'>[];
      })
    | null;
};
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

import {
  DocumentType,
  LoadChargeOpportunityStatus,
  LoadChargeOpportunityType,
  LoadEventActorType,
  LoadEventType,
} from '../generated/prisma/enums';

import { LoadEventsService } from '../load-events/load-events.service';
import { DetentionService } from './detention.service';

type SetAmountInput = {
  amount?: string | number;
};

@Injectable()
export class MoneyOpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly loadEvents: LoadEventsService,
    private readonly detention: DetentionService,
  ) {}

  async scanLoad(currentUser: AuthenticatedUser, loadId: string) {
    const organizationId = currentUser.organizationId;

    const load = await this.prisma.load.findFirst({
      where: {
        id: loadId,

        organizationId,
      },

      select: {
        id: true,

        loadNumber: true,

        currency: true,
        invoiceIssuedAt: true,
        billingSubmittedAt: true,

        documents: {
          where: {
            role: {
              in: [DocumentType.LUMPER_RECEIPT, DocumentType.SCALE_TICKET],
            },
          },

          select: {
            documentId: true,

            role: true,

            document: {
              select: {
                id: true,

                versions: {
                  orderBy: {
                    versionNumber: 'desc',
                  },

                  take: 1,

                  select: {
                    originalFileName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!load) {
      throw new NotFoundException('Load was not found.');
    }

    /*
     * IMPORTANT:
     *
     * Scanning can be triggered more than once
     * at nearly the same time by the UI.
     *
     * Lock the Load row so only one scan for
     * this load can create opportunities at a time.
     *
     * This works across multiple API processes
     * because PostgreSQL owns the lock.
     */
    const transactionResult = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
                        SELECT "id"
                        FROM "loads"
                        WHERE "id" = ${load.id}::uuid AND "organization_id" = ${organizationId}::uuid
                        FOR UPDATE
                    `;

      // Never delete opportunities or their audit history during detection.
      const deduplicatedCount = 0;
      const existing = await tx.loadChargeOpportunity.findMany({
        where: { organizationId, loadId: load.id },
        select: { id: true, sourceDocumentId: true, type: true },
      });
      const currentLoad = await tx.load.findFirst({
        where: { id: load.id, organizationId },
      });
      if (!currentLoad) throw new NotFoundException('Load was not found.');
      const createdIds: string[] = await this.detention.scan(
        tx,
        currentUser,
        currentLoad,
      );

      for (const loadDocument of load.documents) {
        const mapping = this.mapDocumentToOpportunity(loadDocument.role);

        if (!mapping) {
          continue;
        }

        const duplicate = existing.some(
          (opportunity) =>
            opportunity.sourceDocumentId === loadDocument.documentId &&
            opportunity.type === mapping.type,
        );

        if (duplicate) {
          continue;
        }

        const detectedAt = new Date();

        const opportunity = await tx.loadChargeOpportunity.create({
          data: {
            organizationId,

            loadId: load.id,

            sourceDocumentId: loadDocument.documentId,

            type: mapping.type,

            status: LoadChargeOpportunityStatus.DETECTED,

            amount: null,

            currency: load.currency,

            description: mapping.description,

            detectedAt,
          },
        });

        await this.loadEvents.recordInTransaction(tx, {
          actorId: currentUser.id,
          organizationId,

          loadId: load.id,

          type: LoadEventType.CHARGE_OPPORTUNITY_DETECTED,

          actorType: LoadEventActorType.SYSTEM,

          actorName: `${currentUser.firstName} ${currentUser.lastName}`,

          occurredAt: detectedAt,

          metadata: {
            opportunityId: opportunity.id,

            opportunityType: opportunity.type,

            sourceDocumentId: loadDocument.documentId,

            documentType: loadDocument.role,

            originalFileName:
              loadDocument.document.versions[0]?.originalFileName ?? null,

            amount: null,

            currency: load.currency,

            requiresAmountReview: true,
          },
        });

        createdIds.push(opportunity.id);

        /*
         * Add it to our in-memory set too.
         * This protects against duplicate
         * LoadDocument rows during this same
         * transaction.
         */
        existing.push({
          id: opportunity.id,

          sourceDocumentId: opportunity.sourceDocumentId,

          type: opportunity.type,
        });
      }

      return {
        createdIds,

        deduplicatedCount,
      };
    });

    const opportunities = await this.findForLoad(currentUser, loadId);

    const created = opportunities.filter((opportunity) =>
      transactionResult.createdIds.includes(opportunity.id),
    );

    return {
      load: {
        id: load.id,

        loadNumber: load.loadNumber,
      },

      createdCount: created.length,

      deduplicatedCount: transactionResult.deduplicatedCount,

      created,

      opportunities,
    };
  }

  async findForLoad(currentUser: AuthenticatedUser, loadId: string) {
    const organizationId = currentUser.organizationId;

    const load = await this.prisma.load.findFirst({
      where: {
        id: loadId,

        organizationId,
      },

      select: {
        id: true,
      },
    });

    if (!load) {
      throw new NotFoundException('Load was not found.');
    }

    const opportunities = await this.prisma.loadChargeOpportunity.findMany({
      where: {
        organizationId,

        loadId,
      },

      orderBy: {
        detectedAt: 'desc',
      },

      include: {
        sourceDocument: {
          include: {
            versions: {
              orderBy: {
                versionNumber: 'desc',
              },

              take: 1,
            },
          },
        },
      },
    });

    return opportunities.map((opportunity) => this.serialize(opportunity));
  }

  async setAmount(
    currentUser: AuthenticatedUser,
    opportunityId: string,
    input: SetAmountInput,
  ) {
    const organizationId = currentUser.organizationId;
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.loadChargeOpportunity.findFirst({
        where: { id: opportunityId, organizationId },
      });
      if (!target)
        throw new NotFoundException('Money opportunity was not found.');
      await tx.$queryRaw`SELECT id FROM loads WHERE id=${target.loadId}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`;
      const ownerLoad = await tx.load.findFirst({
        where: { id: target.loadId, organizationId },
      });
      if (!ownerLoad || ownerLoad.status === 'CANCELLED')
        throw new ConflictException(
          'This load is not eligible for charge review.',
        );
      await tx.$queryRaw`SELECT id FROM load_charge_opportunities WHERE id = ${opportunityId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;

      const opportunity = await tx.loadChargeOpportunity.findFirst({
        where: {
          id: opportunityId,

          organizationId,
        },
      });

      if (!opportunity) {
        throw new NotFoundException('Money opportunity was not found.');
      }

      if (opportunity.status !== LoadChargeOpportunityStatus.DETECTED) {
        throw new BadRequestException(
          'Only detected opportunities can have their amount reviewed.',
        );
      }

      const amount = this.normalizeMoney(input.amount);

      await this.loadEvents.recordInTransaction(tx, {
        organizationId,
        loadId: opportunity.loadId,
        type: LoadEventType.CHARGE_OPPORTUNITY_DETECTED,
        actorId: currentUser.id,
        actorType: LoadEventActorType.OWNER,
        actorName: `${currentUser.firstName} ${currentUser.lastName}`,
        metadata: {
          action: 'AMOUNT_REVIEWED',
          opportunityId: opportunity.id,
          previousAmount: opportunity.amount?.toString() ?? null,
          amount,
          reviewerRole: currentUser.role,
        },
      });

      const updated = await tx.loadChargeOpportunity.update({
        where: {
          organizationId: currentUser.organizationId,
          id: opportunity.id,
        },

        data: {
          amount,
        },
      });

      return {
        updated: true,

        opportunity: this.serialize(updated),
      };
    });
  }

  async approve(currentUser: AuthenticatedUser, opportunityId: string) {
    const organizationId = currentUser.organizationId;
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.loadChargeOpportunity.findFirst({
        where: { id: opportunityId, organizationId },
      });
      if (!target)
        throw new NotFoundException('Money opportunity was not found.');
      await tx.$queryRaw`SELECT id FROM loads WHERE id=${target.loadId}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`;
      const ownerLoad = await tx.load.findFirst({
        where: { id: target.loadId, organizationId },
      });
      if (!ownerLoad || ownerLoad.status === 'CANCELLED')
        throw new ConflictException(
          'This load is not eligible for charge review.',
        );
      await tx.$queryRaw`SELECT id FROM load_charge_opportunities WHERE id = ${opportunityId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;

      const opportunity = await tx.loadChargeOpportunity.findFirst({
        where: {
          id: opportunityId,

          organizationId,
        },
      });

      if (!opportunity) {
        throw new NotFoundException('Money opportunity was not found.');
      }

      if (opportunity.status === LoadChargeOpportunityStatus.APPROVED) {
        return {
          approved: false,

          message: 'Opportunity is already approved.',

          opportunity: this.serialize(opportunity),
        };
      }

      if (opportunity.status !== LoadChargeOpportunityStatus.DETECTED) {
        throw new BadRequestException(
          `Opportunity cannot be approved while status is ${opportunity.status}.`,
        );
      }

      if (!opportunity.amount) {
        throw new BadRequestException(
          'Confirm the opportunity amount before approving it.',
        );
      }

      const resolvedAt = new Date();

      const updated = await (async () => {
        const result = await tx.loadChargeOpportunity.update({
          where: {
            organizationId: currentUser.organizationId,
            id: opportunity.id,
          },

          data: {
            status: LoadChargeOpportunityStatus.APPROVED,

            resolvedAt,
          },
        });

        await this.loadEvents.recordInTransaction(tx, {
          actorId: currentUser.id,
          organizationId,

          loadId: opportunity.loadId,

          type: LoadEventType.CHARGE_OPPORTUNITY_APPROVED,

          actorType: LoadEventActorType.OWNER,

          actorName: `${currentUser.firstName} ${currentUser.lastName}`,

          occurredAt: resolvedAt,

          metadata: {
            opportunityId: result.id,

            opportunityType: result.type,

            amount: result.amount?.toString() ?? null,

            currency: result.currency,
          },
        });

        return result;
      })();

      return {
        approved: true,

        opportunity: this.serialize(updated),
      };
    });
  }

  async dismiss(currentUser: AuthenticatedUser, opportunityId: string) {
    const organizationId = currentUser.organizationId;
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.loadChargeOpportunity.findFirst({
        where: { id: opportunityId, organizationId },
      });
      if (!target)
        throw new NotFoundException('Money opportunity was not found.');
      await tx.$queryRaw`SELECT id FROM loads WHERE id=${target.loadId}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`;
      const ownerLoad = await tx.load.findFirst({
        where: { id: target.loadId, organizationId },
      });
      if (!ownerLoad || ownerLoad.status === 'CANCELLED')
        throw new ConflictException(
          'This load is not eligible for charge review.',
        );
      await tx.$queryRaw`SELECT id FROM load_charge_opportunities WHERE id = ${opportunityId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;

      const opportunity = await tx.loadChargeOpportunity.findFirst({
        where: {
          id: opportunityId,

          organizationId,
        },
      });

      if (!opportunity) {
        throw new NotFoundException('Money opportunity was not found.');
      }

      if (opportunity.status === LoadChargeOpportunityStatus.DISMISSED) {
        return {
          dismissed: false,

          message: 'Opportunity is already dismissed.',

          opportunity: this.serialize(opportunity),
        };
      }

      if (opportunity.status !== LoadChargeOpportunityStatus.DETECTED) {
        throw new BadRequestException(
          `Opportunity cannot be dismissed while status is ${opportunity.status}.`,
        );
      }

      const resolvedAt = new Date();

      const updated = await (async () => {
        const result = await tx.loadChargeOpportunity.update({
          where: {
            organizationId: currentUser.organizationId,
            id: opportunity.id,
          },

          data: {
            status: LoadChargeOpportunityStatus.DISMISSED,

            resolvedAt,
          },
        });

        await this.loadEvents.recordInTransaction(tx, {
          actorId: currentUser.id,
          organizationId,

          loadId: opportunity.loadId,

          type: LoadEventType.CHARGE_OPPORTUNITY_DISMISSED,

          actorType: LoadEventActorType.OWNER,

          actorName: `${currentUser.firstName} ${currentUser.lastName}`,

          occurredAt: resolvedAt,

          metadata: {
            opportunityId: result.id,

            opportunityType: result.type,

            amount: result.amount?.toString() ?? null,

            currency: result.currency,
          },
        });

        return result;
      })();

      return {
        dismissed: true,

        opportunity: this.serialize(updated),
      };
    });
  }

  private mapDocumentToOpportunity(documentType: DocumentType) {
    if (documentType === DocumentType.LUMPER_RECEIPT) {
      return {
        type: LoadChargeOpportunityType.LUMPER_REIMBURSEMENT,

        description:
          'Lumper receipt captured. Review for broker reimbursement.',
      };
    }

    if (documentType === DocumentType.SCALE_TICKET) {
      return {
        type: LoadChargeOpportunityType.SCALE_REIMBURSEMENT,

        description: 'Scale ticket captured. Review for broker reimbursement.',
      };
    }

    return null;
  }

  private normalizeMoney(value: string | number | undefined) {
    if (value === undefined || value === null) {
      throw new BadRequestException('amount is required.');
    }

    const raw = String(value).trim();

    if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
      throw new BadRequestException(
        'amount must be a non-negative money value with at most two decimal places.',
      );
    }

    const [whole, fraction = ''] = raw.split('.');

    return `${whole}.${fraction.padEnd(2, '0')}`;
  }

  private serialize(opportunity: OpportunityView) {
    return {
      id: opportunity.id,

      loadId: opportunity.loadId,

      sourceDocumentId: opportunity.sourceDocumentId,

      type: opportunity.type,

      status: opportunity.status,

      amount: opportunity.amount?.toString() ?? null,

      currency: opportunity.currency,

      description: opportunity.description,
      evidence: opportunity.evidence,

      detectedAt: opportunity.detectedAt,

      resolvedAt: opportunity.resolvedAt,

      createdAt: opportunity.createdAt,

      updatedAt: opportunity.updatedAt,

      sourceDocument: opportunity.sourceDocument
        ? {
            id: opportunity.sourceDocument.id,

            type: opportunity.sourceDocument.type,

            originalFileName:
              opportunity.sourceDocument.versions?.[0]?.originalFileName ??
              null,
          }
        : undefined,
    };
  }
}
