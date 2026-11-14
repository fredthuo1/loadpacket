import type { AuthenticatedUser } from '../auth/auth.types';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { createHash, randomUUID } from 'node:crypto';

import { DocumentStorage } from './document-storage';
import { rateconFile } from './ratecon-file';

import { PrismaService } from '../database/prisma.service';

import { DocumentStatus, DocumentType } from '../generated/prisma/enums';

const DOCUMENT_STATUS_ORDER: Record<DocumentStatus, number> = {
  [DocumentStatus.UPLOADED]: 1,
  [DocumentStatus.TEXT_EXTRACTED]: 2,
  [DocumentStatus.REVIEW_REQUIRED]: 3,
  [DocumentStatus.CONFIRMED]: 4,
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorage,
  ) {}

  async saveRateCon(currentUser: AuthenticatedUser, file: Express.Multer.File) {
    if (!file?.buffer)
      throw new BadRequestException('Rate Confirmation file is required.');
    const extension = rateconFile(
      file.buffer,
      file.mimetype,
      file.originalname,
    );
    const organizationId = currentUser.organizationId;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const documentId = randomUUID(),
      storageKey = `documents/${documentId}/v1.${extension}`;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'ratecon-upload:' + organizationId},0))`;
          const previous = await tx.documentVersion.findFirst({
            where: {
              organizationId,
              checksum,
              document: { type: DocumentType.RATE_CONFIRMATION },
            },
            include: { document: true },
            orderBy: { createdAt: 'asc' },
          });
          let version = previous;
          if (!version) {
            await this.storage.put(storageKey, file.buffer);
            const document = await tx.document.create({
              data: {
                id: documentId,
                organizationId,
                type: DocumentType.RATE_CONFIRMATION,
                status: DocumentStatus.UPLOADED,
                versions: {
                  create: {
                    organizationId,
                    uploadedByUserId: currentUser.id,
                    versionNumber: 1,
                    originalFileName: file.originalname,
                    mimeType: file.mimetype,
                    sizeBytes: file.buffer.length,
                    checksum,
                    storageKey,
                  },
                },
              },
            });
            version = await tx.documentVersion.findFirstOrThrow({
              where: { organizationId, documentId: document.id },
              include: { document: true },
            });
          }
          return {
            id: version.documentId,
            documentType: version.document.type,
            version: version.versionNumber,
            originalFileName: version.originalFileName,
            mimeType: version.mimeType,
            size: version.sizeBytes,
            checksum: version.checksum,
            status: version.document.status,
            uploadedAt: version.createdAt.toISOString(),
            duplicate: !!previous,
          };
        },
        { timeout: 15000 },
      );
    } catch (error) {
      try {
        if (
          !(await this.prisma.documentVersion.findFirst({
            where: { organizationId, storageKey },
            select: { id: true },
          }))
        )
          await this.storage.removeUncommitted(storageKey);
      } catch {
        /* Retain source on uncertain database outcome. */
      }
      throw error;
    }
  }

  async findDocument(currentUser: AuthenticatedUser, documentId: string) {
    const organizationId = currentUser.organizationId;

    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,

        organizationId,
      },

      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        driverDocument: { select: { driverId: true } },

        versions: {
          orderBy: {
            versionNumber: 'desc',
          },

          select: {
            id: true,
            driverSettlements: { select: { id: true } },
            versionNumber: true,
            originalFileName: true,
            mimeType: true,
            sizeBytes: true,
            checksum: true,
            storageKey: true,
            createdAt: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document was not found.');
    }
    if (document.versions.some((v) => v.driverSettlements?.length))
      throw new NotFoundException(
        'Use the authorized settlement statement endpoint.',
      );

    // Legacy metadata/extraction routes must not bypass vault permissions.
    if (document.driverDocument && currentUser.role !== 'OWNER')
      throw new NotFoundException('Document was not found.');

    return document;
  }

  async readStoredFile(currentUser: AuthenticatedUser, documentId: string) {
    const document = await this.findDocument(currentUser, documentId);

    const latestVersion = document.versions[0];

    if (!latestVersion) {
      throw new NotFoundException('Document version was not found.');
    }

    return this.storage.read(latestVersion.storageKey);
  }

  async advanceDocumentStatus(
    currentUser: AuthenticatedUser,
    documentId: string,
    targetStatus: DocumentStatus,
  ) {
    const organizationId = currentUser.organizationId;

    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,

        organizationId,
      },

      select: {
        id: true,
        status: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document was not found.');
    }

    const currentOrder = DOCUMENT_STATUS_ORDER[document.status];

    const targetOrder = DOCUMENT_STATUS_ORDER[targetStatus];

    /*
     * Document lifecycle is monotonic.
     *
     * Never move a document backwards.
     * For example, re-running extraction on
     * a CONFIRMED document must not change it
     * back to TEXT_EXTRACTED.
     */
    if (currentOrder >= targetOrder) {
      return document;
    }

    return this.prisma.document.update({
      where: { organizationId: currentUser.organizationId, id: document.id },

      data: {
        status: targetStatus,
      },

      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    });
  }
}
