import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { DocumentStorage } from '../documents/document-storage';
import { BROKER_DOCUMENTS, CreateBrokerAccessDto } from './external.dto';
import type { ExternalTransactionAccess } from '../generated/prisma/client';
type PermissionData = { permissions: string[]; documentTypes: string[] };
const fail = () =>
  new NotFoundException(
    'This shared link is unavailable or has expired. Ask the carrier for a new link.',
  );
@Injectable()
export class ExternalService {
  private readonly developmentSecret = randomBytes(32).toString('hex');
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorage,
  ) {}
  private async owned(user: AuthenticatedUser, loadId: string) {
    if (user.role !== 'OWNER') throw new ForbiddenException();
    const load = await this.prisma.load.findFirst({
      where: { id: loadId, organizationId: user.organizationId },
    });
    if (!load) throw fail();
    return load;
  }
  private summary(access: ExternalTransactionAccess) {
    return {
      id: access.id,
      expiresAt: access.expiresAt,
      revokedAt: access.revokedAt,
      lastAccessedAt: access.lastAccessedAt,
      createdAt: access.createdAt,
      permissions: access.permissions,
    };
  }
  async list(user: AuthenticatedUser, loadId: string) {
    await this.owned(user, loadId);
    return (
      await this.prisma.externalTransactionAccess.findMany({
        where: { organizationId: user.organizationId, loadId, role: 'BROKER' },
        orderBy: { createdAt: 'desc' },
      })
    ).map((item) => this.summary(item));
  }
  async create(
    user: AuthenticatedUser,
    loadId: string,
    dto: CreateBrokerAccessDto,
  ) {
    await this.owned(user, loadId);
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const access = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
      await tx.externalTransactionAccess.updateMany({
        where: {
          organizationId: user.organizationId,
          loadId,
          role: 'BROKER',
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      return tx.externalTransactionAccess.create({
        data: {
          organizationId: user.organizationId,
          loadId,
          role: 'BROKER',
          tokenHash,
          permissions: {
            permissions: dto.permissions,
            documentTypes: dto.documentTypes ?? [],
          },
          expiresAt: new Date(Date.now() + (dto.expiresInDays ?? 7) * 86400000),
        },
      });
    });
    // Fragment never reaches web server/access logs. UI keeps it in memory only.
    return { access: this.summary(access), path: `/broker/t#${token}` };
  }
  async revoke(user: AuthenticatedUser, loadId: string, accessId: string) {
    await this.owned(user, loadId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${user.organizationId}::uuid FOR UPDATE`;
      const access = await tx.externalTransactionAccess.findFirst({
        where: {
          id: accessId,
          loadId,
          organizationId: user.organizationId,
          role: 'BROKER',
        },
      });
      if (!access) throw fail();
      if (!access.revokedAt)
        await tx.externalTransactionAccess.update({
          where: { id: access.id, organizationId: user.organizationId },
          data: { revokedAt: new Date() },
        });
      return { revoked: true };
    });
  }
  private async resolve(token: string | undefined) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw fail();
    const access = await this.prisma.externalTransactionAccess.findFirst({
      where: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        role: 'BROKER',
      },
    });
    if (!access || access.revokedAt || access.expiresAt.getTime() <= Date.now())
      throw fail();
    const value = access.permissions as Partial<PermissionData> | null;
    const permissions: PermissionData = {
      permissions: Array.isArray(value?.permissions) ? value.permissions : [],
      documentTypes: Array.isArray(value?.documentTypes)
        ? value.documentTypes
        : [],
    };
    return { access, permissions };
  }
  private signature(accessId: string, versionId: string, expires: number) {
    const configured = process.env.DOCUMENT_DOWNLOAD_SECRET;
    if (
      process.env.NODE_ENV === 'production' &&
      (!configured || configured.length < 32)
    )
      throw new ServiceUnavailableException(
        'Shared downloads are unavailable.',
      );
    return createHmac('sha256', configured || this.developmentSecret)
      .update(`${accessId}:${versionId}:${expires}`)
      .digest('base64url');
  }
  private async files(
    access: ExternalTransactionAccess,
    permissions: PermissionData,
  ) {
    if (!permissions.permissions.includes('VIEW_SHARED_DOCUMENTS')) return [];
    const roles = BROKER_DOCUMENTS.filter((type) =>
      permissions.documentTypes.includes(type),
    );
    const links = await this.prisma.loadDocument.findMany({
      where: {
        organizationId: access.organizationId,
        loadId: access.loadId,
        role: { in: [...roles] },
      },
    });
    const files: {
      versionId: string;
      type: string;
      storageKey: string;
      mimeType: string;
    }[] = [];
    for (const link of links) {
      // Never route through driver/company vault documents, even if a malformed load link exists.
      if (
        (await this.prisma.driverDocument.findFirst({
          where: { documentId: link.documentId },
        })) ||
        (await this.prisma.organizationDocument.findFirst({
          where: { documentId: link.documentId },
        }))
      )
        continue;
      const version = await this.prisma.documentVersion.findFirst({
        where: {
          organizationId: access.organizationId,
          documentId: link.documentId,
        },
        orderBy: { versionNumber: 'desc' },
      });
      if (version)
        files.push({
          versionId: version.id,
          type: link.role,
          storageKey: version.storageKey,
          mimeType: version.mimeType,
        });
    }
    return files;
  }
  async view(token: string | undefined) {
    const { access, permissions } = await this.resolve(token);
    const where = {
      organizationId: access.organizationId,
      loadId: access.loadId,
    };
    const load = await this.prisma.load.findFirst({
      where: { id: access.loadId, organizationId: access.organizationId },
    });
    if (!load) throw fail();
    const can = (permission: string) =>
      permissions.permissions.includes(permission);
    const organization = can('VIEW_LOAD_SUMMARY')
      ? await this.prisma.organization.findFirst({
          where: { id: access.organizationId },
        })
      : null;
    const stops = can('VIEW_ROUTE')
      ? await this.prisma.loadStop.findMany({
          where,
          orderBy: { sequence: 'asc' },
        })
      : [];
    const requirements = can('VIEW_DOCUMENT_STATUS')
      ? await this.prisma.loadRequirement.findMany({ where })
      : [];
    const agreements = can('VIEW_AGREEMENT')
      ? await this.prisma.agreement.findMany({
          where: {
            ...where,
            type: 'RATE_CONFIRMATION',
            status: { not: 'VOIDED' },
          },
        })
      : [];
    const events = can('VIEW_DELIVERY_STATUS')
      ? await this.prisma.loadEvent.findMany({
          where: {
            ...where,
            type: {
              in: [
                'LOAD_STARTED',
                'ARRIVED_PICKUP',
                'DEPARTED_PICKUP',
                'ARRIVED_DELIVERY',
                'DEPARTED_DELIVERY',
                'DELIVERY_CONFIRMED',
                'LOAD_COMPLETED',
              ],
            },
          },
          orderBy: { occurredAt: 'asc' },
        })
      : [];
    const expires = Math.min(Date.now() + 60000, access.expiresAt.getTime());
    const documents = (await this.files(access, permissions)).map((file) => ({
      type: file.type,
      handle: `${expires}.${this.signature(access.id, file.versionId, expires)}`,
      expiresAt: new Date(expires).toISOString(),
    }));
    // Best-effort audit; never print token/provider errors into logs.
    await this.prisma.externalTransactionAccess
      .update({
        where: { id: access.id, organizationId: access.organizationId },
        data: { lastAccessedAt: new Date() },
      })
      .catch(() => undefined);
    return {
      expiresAt: access.expiresAt,
      summary: can('VIEW_LOAD_SUMMARY')
        ? {
            carrier: organization?.name ?? '',
            loadNumber: load.loadNumber,
            status: load.status,
            equipment: load.equipment,
          }
        : null,
      route: stops.map((stop) => ({
        type: stop.type,
        sequence: stop.sequence,
        facilityName: stop.facilityName,
        address: stop.address,
        appointmentText: stop.appointmentText,
      })),
      documents,
      documentStatus: requirements
        .filter((item) =>
          BROKER_DOCUMENTS.some((type) => type === item.documentType),
        )
        .map((item) => ({ type: item.documentType, status: item.status })),
      agreements: agreements.map((item) => ({
        title: item.title,
        status: item.status,
      })),
      timeline: events.map((event) => ({
        type: event.type,
        occurredAt: event.occurredAt,
      })),
    };
  }
  async download(token: string | undefined, handle: string) {
    const { access, permissions } = await this.resolve(token);
    const [expiry, signature] = handle.split('.');
    const expires = Number(expiry);
    if (
      !/^\d{13}\.[A-Za-z0-9_-]{43}$/.test(handle) ||
      !Number.isSafeInteger(expires) ||
      expires <= Date.now() ||
      expires > Date.now() + 60000
    )
      throw fail();
    const files = await this.files(access, permissions);
    const file = files.find((item) => {
      const expected = Buffer.from(
        this.signature(access.id, item.versionId, expires),
      );
      const actual = Buffer.from(signature);
      return (
        expected.length === actual.length && timingSafeEqual(expected, actual)
      );
    });
    if (!file) throw fail();
    const bytes = await this.storage.read(file.storageKey);
    // Revocation/expiry also checked after storage I/O, immediately before delivering bytes.
    await this.resolve(token);
    return {
      bytes,
      mimeType: file.mimeType,
      name: `${file.type}.${file.mimeType === 'application/pdf' ? 'pdf' : file.mimeType === 'image/png' ? 'png' : 'jpg'}`,
    };
  }
}
