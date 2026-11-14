import { requireDriverActionToken } from '../loads/load-action-token';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DocumentStorage } from './document-storage';
import { PrismaService } from '../database/prisma.service';
import { Prisma, type DocumentType } from '../generated/prisma/client';
import { LoadEventsService } from '../load-events/load-events.service';
const allowedTypes = new Set<DocumentType>([
  'BOL',
  'POD',
  'LUMPER_RECEIPT',
  'SCALE_TICKET',
]);
@Injectable()
export class DriverDocumentCaptureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: LoadEventsService,
    private readonly storage: DocumentStorage,
  ) {}
  async capture(
    user: AuthenticatedUser,
    driverId: string,
    loadId: string,
    documentType: DocumentType,
    file: Express.Multer.File,
    actionToken?: string,
  ) {
    if (!allowedTypes.has(documentType))
      throw new BadRequestException(
        'This document type cannot be captured by the driver.',
      );
    if (!file?.buffer?.length)
      throw new BadRequestException(
        'Document file is required and cannot be empty.',
      );
    if (file.buffer.length > 10 * 1024 * 1024)
      throw new BadRequestException('Document must be 10 MB or smaller.');
    const extension =
      file.mimetype === 'application/pdf'
        ? 'pdf'
        : file.mimetype === 'image/jpeg'
          ? 'jpg'
          : file.mimetype === 'image/png'
            ? 'png'
            : null;
    if (!extension)
      throw new UnsupportedMediaTypeException(
        'Driver documents must be PDF, JPG, JPEG, or PNG files.',
      );
    const organizationId = user.organizationId;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    let writtenKey: string | undefined;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`,
        );
        const driver = await tx.driver.findFirst({
          where: { id: driverId, organizationId, status: 'ACTIVE' },
        });
        if (!driver)
          throw new NotFoundException('Active driver was not found.');
        const assignment = await tx.loadAssignment.findFirst({
          where: { organizationId, driverId, loadId },
          include: { load: true },
        });
        if (!assignment)
          throw new NotFoundException(
            'Assigned load was not found for this driver.',
          );
        await requireDriverActionToken(
          tx,
          organizationId,
          loadId,
          driverId,
          actionToken,
        );
        const inTransit =
          assignment.status === 'IN_PROGRESS' &&
          assignment.load.status === 'IN_TRANSIT';
        const delivered =
          assignment.status === 'COMPLETED' &&
          assignment.load.status === 'DELIVERED';
        if (!inTransit && !delivered)
          throw new BadRequestException(
            'Documents can be uploaded only during transit or to correct delivered paperwork.',
          );
        const requirement = await tx.loadRequirement.findFirst({
          where: { organizationId, loadId, documentType },
        });
        if (!requirement)
          throw new BadRequestException(
            `${documentType} is not a requirement for this load.`,
          );
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM load_requirements WHERE id=${requirement.id}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`,
        );
        if (
          requirement.status !== 'MISSING' &&
          requirement.status !== 'REJECTED'
        )
          throw new ConflictException(
            `${documentType} has already been captured for this load.`,
          );
        const load = await tx.load.findFirst({
          where: { id: loadId, organizationId },
          include: {
            documents: {
              include: {
                document: {
                  include: { versions: { orderBy: { versionNumber: 'desc' } } },
                },
              },
            },
          },
        });
        if (!load) throw new NotFoundException('Load was not found.');
        const candidates = load.documents.filter(
          (link) => link.role === documentType,
        );
        const existing = (
          requirement.currentVersionId
            ? candidates.find((link) =>
                link.document.versions.some(
                  (v) => v.id === requirement.currentVersionId,
                ),
              )
            : candidates.sort(
                (a, b) =>
                  b.document.createdAt.getTime() -
                  a.document.createdAt.getTime(),
              )[0]
        )?.document;
        const documentId = existing?.id ?? randomUUID();
        const versionNumber = (existing?.versions[0]?.versionNumber ?? 0) + 1;
        const key = `documents/${documentId}/${randomUUID()}.${extension}`;
        await this.storage.put(key, file.buffer);
        writtenKey = key;
        if (!existing) {
          await tx.document.create({
            data: {
              id: documentId,
              organizationId,
              type: documentType,
              status: 'UPLOADED',
            },
          });
          await tx.loadDocument.create({
            data: { organizationId, loadId, documentId, role: documentType },
          });
        }
        const version = await tx.documentVersion.create({
          data: {
            organizationId,
            documentId,
            versionNumber,
            originalFileName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.buffer.length,
            checksum,
            storageKey: key,
            uploadedByUserId: user.id,
          },
        });
        await tx.loadRequirement.update({
          where: { id: requirement.id, organizationId },
          data: {
            status: 'RECEIVED',
            currentVersionId: version.id,
            reviewedVersionId: null,
            reviewedByUserId: null,
            reviewedAt: null,
            reviewReason: null,
          },
        });
        await this.events.recordInTransaction(tx, {
          organizationId,
          loadId,
          type: 'DOCUMENT_CAPTURED',
          actorType: user.role === 'DRIVER' ? 'DRIVER' : 'OWNER',
          actorId: user.id,
          actorName: `${user.firstName} ${user.lastName}`,
          metadata: {
            assignmentId: assignment.id,
            loadNumber: load.loadNumber,
            documentId,
            documentType,
            versionId: version.id,
            versionNumber,
            originalFileName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.buffer.length,
            checksum,
            requirementId: requirement.id,
            requirementLevel: requirement.requirement,
            requirementStatus: 'RECEIVED',
          },
        });
        return {
          loadId,
          loadNumber: load.loadNumber,
          document: {
            id: documentId,
            type: documentType,
            status: 'UPLOADED',
            versionId: version.id,
            versionNumber,
            originalFileName: file.originalname,
            mimeType: file.mimetype,
            size: file.buffer.length,
            checksum,
          },
          requirement: {
            id: requirement.id,
            documentType,
            requirement: requirement.requirement,
            status: 'RECEIVED',
          },
        };
      });
    } catch (error) {
      if (writtenKey) {
        try {
          if (
            !(await this.prisma.documentVersion.findFirst({
              where: { organizationId, storageKey: writtenKey },
            }))
          )
            await this.storage.removeUncommitted(writtenKey);
        } catch {
          /* Preserve evidence when commit outcome cannot be confirmed. */
        }
      }
      throw error;
    }
  }
}
