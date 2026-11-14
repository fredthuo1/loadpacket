import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DocumentStorage } from './document-storage';
import { VaultService } from './vault.service';

type Grant = {
  organizationId: string;
  userId: string;
  documentId: string;
  versionId: string;
  expiresAt: number;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
@Injectable()
export class DocumentDownloadService {
  private readonly developmentSecret = randomBytes(32).toString('hex');
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
    private readonly storage: DocumentStorage,
  ) {}
  private secret() {
    const configured = process.env.DOCUMENT_DOWNLOAD_SECRET;
    if (configured && configured.length >= 32) return configured;
    if (process.env.NODE_ENV === 'production')
      throw new ServiceUnavailableException(
        'Private document downloads are not configured.',
      );
    return this.developmentSecret;
  }
  private signature(payload: string) {
    return createHmac('sha256', this.secret()).update(payload).digest();
  }
  async issue(user: AuthenticatedUser, documentId: string, versionId: string) {
    const document = await this.vault.authorizedDocument(user, documentId);
    if (!document.versions.some((version) => version.id === versionId))
      throw new NotFoundException('Document version was not found.');
    const expiresAt = Date.now() + 60000;
    const grant: Grant = {
      organizationId: user.organizationId,
      userId: user.id,
      documentId,
      versionId,
      expiresAt,
    };
    const payload = Buffer.from(JSON.stringify(grant)).toString('base64url');
    return {
      path: `/documents/vault-files/${payload}.${this.signature(payload).toString('base64url')}`,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }
  async download(ticket: string) {
    if (ticket.length > 2000)
      throw new ForbiddenException('Download link is invalid or expired.');
    const parts = ticket.split('.');
    if (parts.length !== 2)
      throw new ForbiddenException('Download link is invalid or expired.');
    const expected = this.signature(parts[0]);
    const signature = Buffer.from(parts[1], 'base64url');
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(signature, expected)
    )
      throw new ForbiddenException('Download link is invalid or expired.');
    let grant: Grant;
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(parts[0], 'base64url').toString(),
      );
      if (!parsed || typeof parsed !== 'object') throw new Error();
      const candidate = parsed as Partial<Grant>;
      if (
        ![
          candidate.organizationId,
          candidate.userId,
          candidate.documentId,
          candidate.versionId,
        ].every((value) => typeof value === 'string' && uuid.test(value)) ||
        typeof candidate.expiresAt !== 'number' ||
        candidate.expiresAt <= Date.now() ||
        candidate.expiresAt > Date.now() + 60000
      )
        throw new Error();
      grant = candidate as Grant;
    } catch {
      throw new ForbiddenException('Download link is invalid or expired.');
    }
    const account = await this.prisma.user.findFirst({
      where: {
        id: grant.userId,
        organizationId: grant.organizationId,
        active: true,
      },
      include: { driver: { include: { invitation: true } } },
    });
    if (
      !account ||
      (account.role === 'DRIVER' &&
        (!account.driver ||
          account.driver.status !== 'ACTIVE' ||
          (account.driver.invitation &&
            account.driver.invitation.status !== 'ACCEPTED')))
    )
      throw new ForbiddenException('Document access is no longer available.');
    const user: AuthenticatedUser = {
      id: account.id,
      organizationId: account.organizationId,
      authUserId: account.authUserId,
      role: account.role,
      email: account.email,
      firstName: account.firstName,
      lastName: account.lastName,
      driverId: account.driver?.id ?? null,
      driverName: null,
    };
    const document = await this.vault.authorizedDocument(
      user,
      grant.documentId,
    );
    const version = document.versions.find(
      (item) => item.id === grant.versionId,
    );
    if (!version)
      throw new NotFoundException('Document version was not found.');
    return {
      bytes: await this.storage.read(version.storageKey),
      mimeType: version.mimeType,
      fileName: version.originalFileName,
    };
  }
}
