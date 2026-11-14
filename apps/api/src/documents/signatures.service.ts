import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma, type DocumentSignature } from '../generated/prisma/client';
import { LoadEventsService } from '../load-events/load-events.service';
import { DocumentStorage } from './document-storage';
import { CaptureSignatureDto } from './signature.dto';
import { signaturePng } from './signature-image';
const select = {
  id: true,
  documentId: true,
  documentVersionId: true,
  signerName: true,
  signerRole: true,
  signedAt: true,
  version: { select: { versionNumber: true } },
} as const;
type Client = Prisma.TransactionClient;
@Injectable()
export class SignaturesService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: DocumentStorage,
    private readonly events: LoadEventsService,
  ) {}
  private async authorize(
    db: Client,
    user: AuthenticatedUser,
    documentId: string,
  ) {
    if (!['DRIVER', 'OWNER', 'BACK_OFFICE', 'DISPATCHER'].includes(user.role))
      throw new ForbiddenException();
    const links = await db.loadDocument.findMany({
      where: { documentId, organizationId: user.organizationId },
      include: { document: true },
    });
    if (!links.length) throw new NotFoundException('Document was not found.');
    if (links.length !== 1)
      throw new BadRequestException(
        'Signature capture requires one load association.',
      );
    const link = links[0];
    if (link.document.organizationId !== user.organizationId)
      throw new NotFoundException('Document was not found.');
    if (
      !['BOL', 'POD'].includes(link.document.type) ||
      link.role !== link.document.type
    )
      throw new BadRequestException(
        'Signatures are supported only for load BOL and POD evidence.',
      );
    if (user.role === 'DRIVER') {
      if (
        !user.driverId ||
        !(await db.loadAssignment.findFirst({
          where: {
            organizationId: user.organizationId,
            loadId: link.loadId,
            driverId: user.driverId,
            status: { not: 'CANCELLED' },
            driver: { status: 'ACTIVE', organizationId: user.organizationId },
          },
        }))
      )
        throw new NotFoundException('Assigned document was not found.');
    }
    return link;
  }
  private view(
    row: Prisma.DocumentSignatureGetPayload<{ select: typeof select }>,
  ) {
    return {
      id: row.id,
      documentId: row.documentId,
      documentVersionId: row.documentVersionId,
      signerName: row.signerName,
      signerRole: row.signerRole,
      signedAt: row.signedAt,
      versionNumber: row.version.versionNumber,
    };
  }
  async list(user: AuthenticatedUser, documentId: string) {
    await this.authorize(this.db, user, documentId);
    return {
      signatures: (
        await this.db.documentSignature.findMany({
          where: { organizationId: user.organizationId, documentId },
          select,
          orderBy: { signedAt: 'asc' },
        })
      ).map((row) => this.view(row)),
    };
  }
  async content(user: AuthenticatedUser, documentId: string, id: string) {
    await this.authorize(this.db, user, documentId);
    const row = await this.db.documentSignature.findFirst({
      where: { id, documentId, organizationId: user.organizationId },
    });
    if (!row) throw new NotFoundException('Signature was not found.');
    return this.storage.read(row.signatureStorageKey);
  }
  async capture(
    user: AuthenticatedUser,
    documentId: string,
    dto: CaptureSignatureDto,
  ) {
    if (user.role !== 'DRIVER')
      throw new ForbiddenException(
        'Only the assigned Driver can capture signature evidence.',
      );
    const bytes = signaturePng(dto.image);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    let key: string | undefined;
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${user.organizationId + user.id + dto.idempotencyKey},0))`,
        );
        const link = await this.authorize(tx, user, documentId);
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM loads WHERE id=${link.loadId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`,
        );
        // Recheck assignment under the same load lock used by operational writes.
        await this.authorize(tx, user, documentId);
        const previous = await tx.documentSignature.findFirst({
          where: {
            organizationId: user.organizationId,
            createdByUserId: user.id,
            idempotencyKey: dto.idempotencyKey,
          },
          select: { ...select, signatureChecksum: true },
        });
        if (previous) {
          if (
            previous.documentId !== documentId ||
            previous.documentVersionId !== dto.documentVersionId ||
            previous.signerName !== dto.signerName ||
            previous.signerRole !== dto.signerRole ||
            previous.signatureChecksum !== checksum
          )
            throw new ConflictException(
              'This signature request key was already used for different evidence.',
            );
          return this.view(previous);
        }
        if (
          !['DRIVER', link.role === 'BOL' ? 'SHIPPER' : 'RECEIVER'].includes(
            dto.signerRole,
          )
        )
          throw new BadRequestException(
            'Signer role does not match this document type.',
          );
        const version = await tx.documentVersion.findFirst({
          where: {
            id: dto.documentVersionId,
            documentId,
            organizationId: user.organizationId,
          },
        });
        if (!version)
          throw new NotFoundException('Document version was not found.');
        const requirement = await tx.loadRequirement.findFirst({
          where: {
            organizationId: user.organizationId,
            loadId: link.loadId,
            documentType: link.role,
            currentVersionId: version.id,
          },
        });
        if (
          !requirement ||
          !['RECEIVED', 'ACCEPTED'].includes(requirement.status)
        )
          throw new ConflictException(
            'Refresh the document. Sign only the current uploaded BOL or POD version.',
          );
        const id = randomUUID();
        key = `documents/${documentId}/${id}.png`;
        try {
          await this.storage.put(key, bytes);
        } catch {
          throw new ServiceUnavailableException(
            'Signature storage is unavailable. Please retry.',
          );
        }
        const row = await tx.documentSignature.create({
          data: {
            id,
            organizationId: user.organizationId,
            loadId: link.loadId,
            documentId,
            documentVersionId: version.id,
            documentType: link.role,
            signerName: dto.signerName,
            signerRole: dto.signerRole,
            signatureStorageKey: key,
            signatureChecksum: checksum,
            createdByUserId: user.id,
            idempotencyKey: dto.idempotencyKey,
          },
          select,
        });
        await this.events.recordInTransaction(tx, {
          organizationId: user.organizationId,
          loadId: link.loadId,
          type: 'DOCUMENT_SIGNATURE_CAPTURED',
          actorType: 'DRIVER',
          actorId: user.id,
          metadata: {
            documentId,
            documentVersionId: version.id,
            signatureId: id,
            signerRole: dto.signerRole,
            signedAt: row.signedAt.toISOString(),
          },
        });
        return this.view(row);
      });
    } catch (error) {
      if (key)
        try {
          const committed: DocumentSignature | null =
            await this.db.documentSignature.findFirst({
              where: {
                organizationId: user.organizationId,
                signatureStorageKey: key,
              },
            });
          if (!committed) await this.storage.removeUncommitted(key);
        } catch {
          /* Preserve artifact when commit outcome is uncertain. */
        }
      throw error;
    }
  }
}
