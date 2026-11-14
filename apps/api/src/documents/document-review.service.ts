import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type RequirementStatus } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { LoadEventsService } from '../load-events/load-events.service';
import { reconcileReadiness } from '../loads/readiness-transition';
import type { AuthenticatedUser } from '../auth/auth.types';
const include = {
  requirements: true,
  documents: {
    include: {
      document: {
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' as const },
            include: {
              uploadedBy: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.LoadInclude;
type ReviewLoad = Prisma.LoadGetPayload<{ include: typeof include }>;
type Requirement = ReviewLoad['requirements'][number];
export function requirementEvidence(
  load: ReviewLoad,
  requirement: Requirement,
) {
  const versions = load.documents
    .filter(
      (link) =>
        link.role === requirement.documentType &&
        link.organizationId === load.organizationId,
    )
    .flatMap((link) =>
      link.document.versions
        .filter((version) => version.organizationId === load.organizationId)
        .map((version) => ({ documentId: link.documentId, version })),
    )
    .sort(
      (a, b) =>
        b.version.createdAt.getTime() - a.version.createdAt.getTime() ||
        b.version.versionNumber - a.version.versionNumber,
    );
  return (
    (requirement.currentVersionId
      ? versions.find(
          (item) => item.version.id === requirement.currentVersionId,
        )
      : versions[0]) ?? null
  );
}
@Injectable()
export class DocumentReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: LoadEventsService,
  ) {}
  private authorize(user: AuthenticatedUser) {
    if (user.role !== 'OWNER' && user.role !== 'BACK_OFFICE')
      throw new ForbiddenException(
        'Only the Owner or Back Office can review paperwork.',
      );
  }
  async list(user: AuthenticatedUser, loadId: string) {
    this.authorize(user);
    const load = await this.prisma.load.findFirst({
      where: { id: loadId, organizationId: user.organizationId },
      include,
    });
    if (!load) throw new NotFoundException('Load was not found.');
    return {
      loadStatus: load.status,
      requirements: load.requirements.map((requirement) => {
        const evidence = requirementEvidence(load, requirement);
        return {
          id: requirement.id,
          documentType: requirement.documentType,
          status: requirement.status,
          reason: requirement.reviewReason,
          reviewedAt: requirement.reviewedAt,
          documentId: evidence?.documentId ?? null,
          versionId: evidence?.version.id ?? null,
          versionNumber: evidence?.version.versionNumber ?? null,
          fileName: evidence?.version.originalFileName ?? null,
          uploadedBy: evidence?.version.uploadedBy
            ? `${evidence.version.uploadedBy.firstName} ${evidence.version.uploadedBy.lastName}`
            : null,
        };
      }),
    };
  }
  async review(
    user: AuthenticatedUser,
    loadId: string,
    requirementId: string,
    status: 'ACCEPTED' | 'REJECTED' | 'WAIVED',
    versionId?: string,
    reason?: string,
  ) {
    this.authorize(user);
    return this.prisma.$transaction(async (tx) => {
      // All review and capture mutations acquire load then requirement locks.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM load_requirements WHERE id=${requirementId}::uuid AND load_id=${loadId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`,
      );
      const load = await tx.load.findFirst({
        where: { id: loadId, organizationId: user.organizationId },
        include,
      });
      const requirement = load?.requirements.find(
        (item) =>
          item.id === requirementId &&
          item.organizationId === user.organizationId,
      );
      if (!load || !requirement)
        throw new NotFoundException('Load requirement was not found.');
      const evidence = requirementEvidence(load, requirement);
      if ((versionId ?? null) !== (evidence?.version.id ?? null))
        throw new ConflictException(
          'Document evidence changed. Refresh and review the current version.',
        );
      if (
        requirement.status === status &&
        requirement.reviewedVersionId === (versionId ?? null) &&
        requirement.reviewReason === (reason ?? null)
      )
        return { changed: false, status };
      if (load.status === 'INVOICED' || load.status === 'PAID')
        throw new ConflictException('Billed paperwork cannot be changed.');
      const allowed: RequirementStatus[] =
        status === 'WAIVED'
          ? ['MISSING', 'RECEIVED', 'REJECTED']
          : ['RECEIVED'];
      if (!allowed.includes(requirement.status))
        throw new ConflictException(
          `Cannot ${status.toLowerCase()} paperwork while its status is ${requirement.status}.`,
        );
      if (status !== 'WAIVED' && !evidence)
        throw new BadRequestException(
          'A received document version is required for review.',
        );
      if (status !== 'ACCEPTED' && !reason?.trim())
        throw new BadRequestException('A reason is required.');
      const reviewedAt = new Date();
      await tx.loadRequirement.update({
        where: { id: requirementId, organizationId: user.organizationId },
        data: {
          status,
          currentVersionId: evidence?.version.id ?? null,
          reviewedVersionId: versionId ?? null,
          reviewedByUserId: user.id,
          reviewedAt,
          reviewReason: reason ?? null,
        },
      });
      await this.events.recordInTransaction(tx, {
        organizationId: user.organizationId,
        loadId,
        type:
          status === 'ACCEPTED'
            ? 'DOCUMENT_VALIDATED'
            : status === 'REJECTED'
              ? 'DOCUMENT_REJECTED'
              : 'DOCUMENT_WAIVED',
        actorType: user.role === 'OWNER' ? 'OWNER' : 'SYSTEM',
        actorId: user.id,
        actorName: `${user.firstName} ${user.lastName}`,
        occurredAt: reviewedAt,
        metadata: {
          requirementId,
          documentType: requirement.documentType,
          documentId: evidence?.documentId ?? null,
          versionId: versionId ?? null,
          previousStatus: requirement.status,
          status,
          reason: reason ?? null,
          reviewerRole: user.role,
        },
      });
      const result = await reconcileReadiness(tx, user, loadId, this.events);
      return {
        changed: true,
        status,
        loadStatus: result.status,
        readiness: result.readiness,
      };
    });
  }
}
