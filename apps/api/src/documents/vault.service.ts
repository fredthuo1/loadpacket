import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import {
  Prisma,
  type CompanyDocumentType,
  type DriverDocumentType,
} from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DocumentStorage } from './document-storage';
import { type VersionUploadDto, type VaultQueryDto } from './vault.dto';
import type { VaultDocument } from '../../../../packages/api-contracts/vault';

const documentInclude = {
  organization: { select: { name: true } },
  organizationDocument: true,
  driverDocument: {
    include: {
      driver: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  loadDocuments: {
    include: { load: { select: { id: true, loadNumber: true } } },
  },
  versions: {
    orderBy: { versionNumber: 'desc' },
    include: {
      uploadedBy: { select: { firstName: true, lastName: true } },
      driverSettlements: { select: { id: true } },
    },
  },
} satisfies Prisma.DocumentInclude;
type DocumentRow = Prisma.DocumentGetPayload<{
  include: typeof documentInclude;
}>;
type Context =
  | { kind: 'COMPANY'; type: CompanyDocumentType }
  | { kind: 'DRIVER'; driverId: string; type: DriverDocumentType };

export function documentExpiration(
  expiresAt: Date | null,
  now = new Date(),
): VaultDocument['expiration'] {
  if (!expiresAt) return 'NO_EXPIRATION';
  // An expiration date remains valid through that UTC calendar day.
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const days = (expiresAt.getTime() - today) / 86400000;
  return days < 0 ? 'EXPIRED' : days <= 30 ? 'EXPIRING_SOON' : 'VALID';
}

@Injectable()
export class VaultService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorage,
  ) {}
  private canRead(user: AuthenticatedUser, document: DocumentRow) {
    // Payroll statements are delivered only through the settlement-authorized endpoint.
    if (document.versions.some((v) => v.driverSettlements?.length))
      return false;
    if (user.role === 'OWNER') return true;
    if (document.driverDocument)
      return (
        user.role === 'DRIVER' &&
        document.driverDocument.driverId === user.driverId
      );
    return user.role === 'DISPATCHER' || user.role === 'BACK_OFFICE';
  }
  private view(document: DocumentRow): VaultDocument {
    const driver = document.driverDocument?.driver;
    const load = document.loadDocuments[0]?.load;
    return {
      id: document.id,
      context: document.organizationDocument
        ? 'COMPANY'
        : driver
          ? 'DRIVER'
          : 'LOAD',
      ownerId: document.organizationDocument
        ? document.organizationId
        : (driver?.id ?? load?.id ?? document.id),
      ownerName: document.organizationDocument
        ? document.organization.name
        : driver
          ? `${driver.firstName} ${driver.lastName}`
          : (load?.loadNumber ?? 'Unassigned load document'),
      type:
        document.organizationDocument?.type ??
        document.driverDocument?.type ??
        document.type,
      status: document.status,
      expiration: documentExpiration(document.versions[0]?.expiresAt ?? null),
      versions: document.versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        originalFileName: version.originalFileName,
        mimeType: version.mimeType,
        sizeBytes: version.sizeBytes,
        checksum: version.checksum,
        uploadedAt: version.createdAt.toISOString(),
        uploadedBy: version.uploadedBy
          ? `${version.uploadedBy.firstName} ${version.uploadedBy.lastName}`
          : null,
        issuedAt: version.issuedAt?.toISOString().slice(0, 10) ?? null,
        expiresAt: version.expiresAt?.toISOString().slice(0, 10) ?? null,
      })),
    };
  }
  async authorizedDocument(user: AuthenticatedUser, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId: user.organizationId },
      include: documentInclude,
    });
    if (!document || !this.canRead(user, document))
      throw new NotFoundException('Document was not found.');
    return document;
  }
  async detail(user: AuthenticatedUser, documentId: string) {
    return this.view(await this.authorizedDocument(user, documentId));
  }
  async list(user: AuthenticatedUser, query: VaultQueryDto = {}) {
    const rows = await this.prisma.document.findMany({
      where: { organizationId: user.organizationId },
      include: documentInclude,
      orderBy: { createdAt: 'desc' },
    });
    const search = query.search?.toLowerCase();
    return rows
      .filter((row) => this.canRead(user, row))
      .map((row) => this.view(row))
      .filter(
        (row) =>
          (!query.context || row.context === query.context) &&
          (!query.type || row.type === query.type) &&
          (!query.status || row.status === query.status) &&
          (!query.expiration || row.expiration === query.expiration) &&
          (!search ||
            `${row.ownerName} ${row.type} ${row.versions[0]?.originalFileName ?? ''}`
              .toLowerCase()
              .includes(search)),
      );
  }
  async driverDocuments(user: AuthenticatedUser, driverId: string) {
    if (
      user.role !== 'OWNER' &&
      !(user.role === 'DRIVER' && user.driverId === driverId)
    )
      throw new NotFoundException('Driver documents were not found.');
    if (
      !(await this.prisma.driver.findFirst({
        where: { id: driverId, organizationId: user.organizationId },
      }))
    )
      throw new NotFoundException('Driver was not found.');
    return (await this.list(user, { context: 'DRIVER' })).filter(
      (document) => document.ownerId === driverId,
    );
  }
  private validateFile(file: Express.Multer.File) {
    if (!file?.buffer?.length || file.buffer.length > 10 * 1024 * 1024)
      throw new BadRequestException(
        'Provide a nonempty file no larger than 10 MB.',
      );
    const type = file.mimetype;
    const valid =
      type === 'application/pdf'
        ? file.buffer.subarray(0, 5).toString() === '%PDF-'
        : type === 'image/png'
          ? file.buffer
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : type === 'image/jpeg'
            ? file.buffer[0] === 255 &&
              file.buffer[1] === 216 &&
              file.buffer[2] === 255
            : false;
    if (!valid)
      throw new BadRequestException('Upload a valid PDF, PNG or JPEG file.');
    const name = Array.from(file.originalname, (char) =>
      char.charCodeAt(0) < 32 ||
      char.charCodeAt(0) === 127 ||
      char === '/' ||
      char === '\\'
        ? '_'
        : char,
    )
      .join('')
      .trim();
    if (!name || name.length > 255)
      throw new BadRequestException(
        'File name must be between 1 and 255 characters.',
      );
    return {
      name,
      extension:
        type === 'application/pdf'
          ? 'pdf'
          : type === 'image/png'
            ? 'png'
            : 'jpg',
      checksum: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }
  async upload(
    user: AuthenticatedUser,
    context: Context | null,
    dto: VersionUploadDto,
    file: Express.Multer.File,
    documentId?: string,
  ) {
    if (user.role !== 'OWNER')
      throw new ForbiddenException(
        'Only the Owner can manage company and driver documents.',
      );
    const validated = this.validateFile(file);
    if (dto.issuedAt && dto.expiresAt && dto.expiresAt < dto.issuedAt)
      throw new BadRequestException(
        'Expiration must not be before the issue date.',
      );
    const issuedAt = dto.issuedAt
      ? new Date(`${dto.issuedAt}T00:00:00Z`)
      : null;
    const expiresAt = dto.expiresAt
      ? new Date(`${dto.expiresAt}T00:00:00Z`)
      : null;
    let writtenKey: string | undefined;
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        // Serializes same-operation retries, including concurrent new uploads.
        await tx.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${user.organizationId}:${dto.uploadKey}`}, 0))`,
        );
        if (
          context?.kind === 'DRIVER' &&
          !(await tx.driver.findFirst({
            where: {
              id: context.driverId,
              organizationId: user.organizationId,
            },
          }))
        )
          throw new NotFoundException('Driver was not found.');
        const previous = await tx.documentVersion.findFirst({
          where: {
            organizationId: user.organizationId,
            uploadKey: dto.uploadKey,
          },
          include: { document: { include: documentInclude } },
        });
        if (previous) {
          const view = this.view(previous.document);
          if (
            previous.checksum !== validated.checksum ||
            previous.originalFileName !== validated.name ||
            previous.mimeType !== file.mimetype ||
            (previous.issuedAt?.getTime() ?? null) !==
              (issuedAt?.getTime() ?? null) ||
            (previous.expiresAt?.getTime() ?? null) !==
              (expiresAt?.getTime() ?? null) ||
            (documentId
              ? previous.documentId !== documentId
              : !context ||
                view.context !== context.kind ||
                view.type !== context.type ||
                view.ownerId !==
                  (context.kind === 'DRIVER'
                    ? context.driverId
                    : user.organizationId))
          )
            throw new ConflictException(
              'This upload key was already used for different document content or metadata.',
            );
          return previous.documentId;
        }
        let versionNumber = 1;
        const id = documentId ?? randomUUID();
        if (documentId) {
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM documents WHERE id=${documentId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`,
          );
          const existing = await tx.document.findFirst({
            where: { id: documentId, organizationId: user.organizationId },
            include: documentInclude,
          });
          if (!existing) throw new NotFoundException('Document was not found.');
          if (!existing.organizationDocument && !existing.driverDocument)
            throw new ConflictException(
              'Use the load document workflow to correct load paperwork.',
            );
          versionNumber = (existing.versions[0]?.versionNumber ?? 0) + 1;
        } else {
          if (!context)
            throw new BadRequestException('Document context is required.');
          await tx.document.create({
            data: {
              id,
              organizationId: user.organizationId,
              type: 'OTHER',
              status: 'UPLOADED',
            },
          });
          if (context.kind === 'COMPANY')
            await tx.organizationDocument.create({
              data: {
                organizationId: user.organizationId,
                documentId: id,
                type: context.type,
              },
            });
          else
            await tx.driverDocument.create({
              data: {
                organizationId: user.organizationId,
                documentId: id,
                driverId: context.driverId,
                type: context.type,
              },
            });
        }
        const key = `documents/${id}/${randomUUID()}.${validated.extension}`;
        await this.storage.put(key, file.buffer);
        writtenKey = key;
        await tx.documentVersion.create({
          data: {
            organizationId: user.organizationId,
            documentId: id,
            versionNumber,
            originalFileName: validated.name,
            mimeType: file.mimetype,
            sizeBytes: file.buffer.length,
            checksum: validated.checksum,
            storageKey: key,
            uploadedByUserId: user.id,
            uploadKey: dto.uploadKey,
            issuedAt,
            expiresAt,
          },
        });
        return id;
      });
      return await this.detail(user, id);
    } catch (error) {
      if (writtenKey) {
        // Never remove a committed immutable file after an uncertain response.
        try {
          if (
            !(await this.prisma.documentVersion.findFirst({
              where: {
                organizationId: user.organizationId,
                storageKey: writtenKey,
              },
            }))
          )
            await this.storage.removeUncommitted(writtenKey);
        } catch {
          /* Preserve evidence if database state is uncertain. */
        }
      }
      throw error;
    }
  }
}
