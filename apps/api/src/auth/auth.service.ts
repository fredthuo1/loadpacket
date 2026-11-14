import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DriverStatus, UserRole } from '../generated/prisma/enums';
import { TokenVerifier } from './token-verifier';
import type { AuthenticatedUser } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly verifier: TokenVerifier,
    private readonly prisma: PrismaService,
  ) {}

  async authenticate(token: string): Promise<AuthenticatedUser> {
    const { sub, passwordAuthenticatedAt } = await this.verifier.verify(token);
    // Identity lookup is the deliberate bootstrap exception to tenant scoping.
    const user = await this.prisma.user.findUnique({
      where: { authUserId: sub },
      include: { driver: { include: { invitation: true } } },
    });
    if (!user)
      throw new ForbiddenException({
        code: 'ACCOUNT_SETUP_REQUIRED',
        message:
          'Your account has not been linked to LoadPacket. Complete organization setup or open your staff invitation.',
      });
    if (!user.active)
      throw new ForbiddenException('Your LoadPacket account is inactive.');
    if (
      user.role === UserRole.DRIVER &&
      (!user.driver ||
        user.driver.organizationId !== user.organizationId ||
        user.driver.status !== DriverStatus.ACTIVE)
    ) {
      throw new ForbiddenException(
        'Your account needs an active driver mapping. Contact your administrator.',
      );
    }
    return Object.freeze({
      passwordAuthenticatedAt,
      onboardingRequired:
        !!user.driver?.invitation &&
        user.driver.invitation.status !== 'ACCEPTED',
      id: user.id,
      authUserId: user.authUserId,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      driverId:
        user.role === UserRole.DRIVER ? (user.driver?.id ?? null) : null,
      driverName:
        user.role === UserRole.DRIVER && user.driver
          ? `${user.driver.firstName} ${user.driver.lastName}`
          : null,
    });
  }
}
