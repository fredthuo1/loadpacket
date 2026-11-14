import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { LoadEventsService } from '../load-events/load-events.service';
import { DetentionTermsDto } from './detention-terms.dto';
import { calculateDetention, type DetentionTerms } from './detention';

@Injectable()
export class DetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: LoadEventsService,
  ) {}
  async confirmTerms(
    user: AuthenticatedUser,
    loadId: string,
    input: DetentionTermsDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const organizationId = user.organizationId;
      await tx.$queryRaw`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`;
      const load = await tx.load.findFirst({
        where: { id: loadId, organizationId },
      });
      if (!load) throw new NotFoundException('Load was not found.');
      let agreement = await tx.agreement.findFirst({
        where: {
          organizationId,
          loadId,
          type: 'LOAD_AMENDMENT',
          title: 'Detention terms review',
          status: 'DRAFT',
        },
      });
      if (!agreement)
        agreement = await tx.agreement.create({
          data: {
            organizationId,
            loadId,
            type: 'LOAD_AMENDMENT',
            title: 'Detention terms review',
            status: 'DRAFT',
          },
        });
      const previous = await tx.agreementVersion.findFirst({
        where: { organizationId, agreementId: agreement.id },
        orderBy: { versionNumber: 'desc' },
      });
      const terms = {
        schemaVersion: 1,
        detention: { ...input },
        reviewedByUserId: user.id,
      };
      const contentHash = createHash('sha256')
        .update(JSON.stringify(terms))
        .digest('hex');
      if (previous?.contentHash === contentHash)
        return { version: previous.versionNumber, changed: false };
      const version = await tx.agreementVersion.create({
        data: {
          organizationId,
          agreementId: agreement.id,
          versionNumber: (previous?.versionNumber ?? 0) + 1,
          contentHash,
          terms,
          currency: load.currency,
        },
      });
      await this.events.recordInTransaction(tx, {
        organizationId,
        loadId,
        type: 'AGREEMENT_CREATED',
        actorId: user.id,
        actorType: 'OWNER',
        actorName: `${user.firstName} ${user.lastName}`,
        metadata: {
          action: 'DETENTION_TERMS_REVIEWED',
          agreementVersionId: version.id,
          basis: input.basis,
          reviewerRole: user.role,
        },
      });
      return { version: version.versionNumber, changed: true };
    });
  }
  async scan(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    load: {
      id: string;
      currency: string;
      invoiceIssuedAt?: Date | null;
      billingSubmittedAt?: Date | null;
    },
  ) {
    const organizationId = user.organizationId;
    const agreements = await tx.agreement.findMany({
      where: { organizationId, loadId: load.id, status: { not: 'VOIDED' } },
      orderBy: { createdAt: 'desc' },
    });
    let terms: DetentionTerms | null = null;
    let agreementVersionId: string | null = null;
    for (const agreement of agreements) {
      if (agreement.status === 'SUPERSEDED') continue;
      const version = await tx.agreementVersion.findFirst({
        where: { organizationId, agreementId: agreement.id },
        orderBy: { versionNumber: 'desc' },
      });
      const data = version?.terms as { detention?: DetentionTerms } | null;
      if (
        data?.detention &&
        Number.isInteger(data.detention.freeMinutes) &&
        data.detention.freeMinutes >= 0 &&
        data.detention.freeMinutes <= 10080 &&
        [data.detention.hourlyRate, data.detention.maximumAmount].every(
          (value) =>
            value == null ||
            (typeof value === 'string' && /^\d{1,10}(\.\d{1,2})?$/.test(value)),
        ) &&
        [
          data.detention.minimumBillableMinutes,
          data.detention.roundingIncrementMinutes,
        ].every(
          (value) =>
            value == null ||
            (Number.isInteger(value) && value > 0 && value <= 10080),
        )
      ) {
        terms = data.detention;
        agreementVersionId = version!.id;
        break;
      }
    }
    const stops = await tx.loadStop.findMany({
      where: { organizationId, loadId: load.id },
      orderBy: { sequence: 'asc' },
    });
    const createdIds: string[] = [];
    for (const stop of stops) {
      const result = calculateDetention(stop.arrivedAt, stop.departedAt, terms);
      if (!result) continue;
      const detectionKey = `detention:${stop.id}`;
      if (
        await tx.loadChargeOpportunity.findFirst({
          where: { organizationId, loadId: load.id, detectionKey },
        })
      )
        continue;
      const evidence = {
        ...result,
        stopId: stop.id,
        stopType: stop.type,
        arrivedAt: stop.arrivedAt!.toISOString(),
        departedAt: stop.departedAt!.toISOString(),
        agreementVersionId,
        requiresAmountReview: true,
        billingFollowUpRequired: !!(
          load.invoiceIssuedAt || load.billingSubmittedAt
        ),
      };
      const opportunity = await tx.loadChargeOpportunity.create({
        data: {
          organizationId,
          loadId: load.id,
          type: 'DETENTION',
          status: 'DETECTED',
          detectionKey,
          amount: result.calculatedAmount,
          currency: load.currency,
          evidence,
          description: `Detention — ${stop.type === 'PICKUP' ? 'Pickup' : 'Delivery'}. ${result.totalWaitMinutes} minutes on site. ${result.reason}${evidence.billingFollowUpRequired ? ' Invoice already issued: separate billing follow-up required.' : ''}`,
        },
      });
      await this.events.recordInTransaction(tx, {
        organizationId,
        loadId: load.id,
        type: 'CHARGE_OPPORTUNITY_DETECTED',
        actorType: 'SYSTEM',
        actorId: user.id,
        metadata: {
          opportunityId: opportunity.id,
          opportunityType: 'DETENTION',
          ...evidence,
        },
      });
      createdIds.push(opportunity.id);
    }
    return createdIds;
  }
}
