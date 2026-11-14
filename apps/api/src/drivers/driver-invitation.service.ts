import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  DriverIdentityProvider,
  type CreatedIdentity,
} from '../integrations/supabase/driver-identity-provider';
import { lockDriver } from './driver-lock';

@Injectable()
export class DriverInvitationService {
  private readonly logger = new Logger(DriverInvitationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly identities: DriverIdentityProvider,
  ) {}
  private audit(
    user: AuthenticatedUser,
    driverId: string,
    action: string,
    result: string,
  ) {
    this.logger.log({
      actorId: user.id,
      organizationId: user.organizationId,
      driverId,
      action,
      result,
      timestamp: new Date().toISOString(),
    });
  }
  private async driver(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    driverId: string,
  ) {
    await lockDriver(tx, user.organizationId, driverId);
    const driver = await tx.driver.findFirst({
      where: { id: driverId, organizationId: user.organizationId },
      include: { user: true, invitation: true, organization: true },
    });
    if (!driver) throw new NotFoundException('Driver was not found.');
    if (driver.status !== 'ACTIVE')
      throw new ConflictException(
        'Activate the driver before inviting or completing an invitation.',
      );
    if (!driver.email)
      throw new ConflictException(
        'Add a driver email before sending an invitation.',
      );
    if (
      driver.userId &&
      (!driver.user ||
        !driver.user.active ||
        driver.user.role !== 'DRIVER' ||
        driver.user.organizationId !== user.organizationId ||
        driver.user.email.toLowerCase() !== driver.email.toLowerCase())
    )
      throw new ConflictException(
        'The driver account mapping needs administrator review.',
      );
    if (
      driver.invitation &&
      (!driver.user ||
        driver.invitation.authUserId !== driver.user.authUserId ||
        driver.invitation.email.toLowerCase() !== driver.email.toLowerCase() ||
        driver.invitation.organizationId !== user.organizationId ||
        driver.invitation.status === 'CANCELLED')
    )
      throw new ConflictException(
        'The invitation mapping needs administrator review.',
      );
    return driver;
  }
  async invite(user: AuthenticatedUser, driverId: string) {
    let created: CreatedIdentity | undefined;
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const driver = await this.driver(tx, user, driverId);
          if (driver.userId)
            return {
              accountStatus:
                driver.invitation?.status === 'PENDING'
                  ? 'INVITE_PENDING'
                  : 'CONNECTED',
            };
          const email = driver.email!.trim().toLowerCase();
          // A local email match is a conflict, never authority to link an identity.
          if (
            await tx.user.findFirst({
              where: {
                organizationId: user.organizationId,
                email: { equals: email, mode: 'insensitive' },
              },
            })
          )
            throw new ConflictException(
              'An application account already uses this email. Contact your administrator.',
            );
          created = await this.identities.invite({
            email,
            firstName: driver.firstName,
            lastName: driver.lastName,
            companyName:
              driver.organization.dbaName || driver.organization.name,
          });
          const account = await tx.user.create({
            data: {
              organizationId: user.organizationId,
              authUserId: created.id,
              role: 'DRIVER',
              email,
              firstName: driver.firstName,
              lastName: driver.lastName,
              active: true,
            },
          });
          await tx.driver.update({
            where: { id: driverId, organizationId: user.organizationId },
            data: { userId: account.id },
          });
          await tx.driverInvitation.create({
            data: {
              organizationId: user.organizationId,
              driverId,
              email,
              authUserId: created.id,
            },
          });
          return { accountStatus: 'INVITE_PENDING' };
        },
        { timeout: 30000 },
      );
      this.audit(user, driverId, 'driver.invite', 'success');
      return result;
    } catch (error) {
      if (created) {
        let compensated = false;
        try {
          // A commit acknowledgment can be lost. Never delete an identity that
          // has any committed application mapping, including another tenant.
          const mapped = await this.prisma.user.findUnique({
            where: { authUserId: created.id },
            select: { id: true },
          });
          if (!mapped) compensated = await this.identities.compensate(created);
        } catch {
          /* Uncertain database state must never authorize deletion. */
        }
        this.audit(
          user,
          driverId,
          'driver.invite.compensation',
          compensated
            ? 'removed-new-unactivated-identity'
            : 'administrator-review-required',
        );
      }
      this.audit(user, driverId, 'driver.invite', 'failed');
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Account provisioning could not complete. Contact your administrator before retrying.',
      );
    }
  }
  async resend(user: AuthenticatedUser, driverId: string) {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const driver = await this.driver(tx, user, driverId);
          const invite = driver.invitation;
          if (
            !driver.userId ||
            !invite ||
            invite.status !== 'PENDING' ||
            !invite.authUserId
          )
            throw new ConflictException(
              'Only pending invitations can be resent.',
            );
          if (Date.now() - invite.lastSentAt.getTime() < 60000)
            throw new HttpException(
              'Wait at least 60 seconds between invitation emails.',
              429,
            );
          await this.identities.resend(invite.authUserId, invite.email);
          await tx.driverInvitation.update({
            where: { id: invite.id, organizationId: user.organizationId },
            data: { lastSentAt: new Date() },
          });
        },
        { timeout: 20000 },
      );
      this.audit(user, driverId, 'driver.invite.resend', 'success');
      return { accountStatus: 'INVITE_PENDING' };
    } catch (error) {
      this.audit(user, driverId, 'driver.invite.resend', 'failed');
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Invitation resend could not complete. Wait before retrying.',
      );
    }
  }
  async complete(user: AuthenticatedUser) {
    if (!user.driverId)
      throw new ForbiddenException('An active driver invitation is required.');
    const driverId = user.driverId;
    await this.prisma.$transaction(async (tx) => {
      const driver = await this.driver(tx, user, driverId);
      const invite = driver.invitation;
      if (
        !invite ||
        driver.userId !== user.id ||
        driver.user?.authUserId !== user.authUserId ||
        invite.authUserId !== user.authUserId
      )
        throw new ForbiddenException(
          'This invitation does not belong to your account.',
        );
      if (invite.status === 'ACCEPTED') return;
      if (
        !user.passwordAuthenticatedAt ||
        user.passwordAuthenticatedAt <
          Math.floor(invite.firstSentAt.getTime() / 1000)
      )
        throw new ForbiddenException(
          'Create your password and sign in before activating your account.',
        );
      await tx.driverInvitation.update({
        where: { id: invite.id, organizationId: user.organizationId },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
    });
    this.audit(user, driverId, 'driver.invite.complete', 'success');
    return { accountStatus: 'CONNECTED' };
  }
}
