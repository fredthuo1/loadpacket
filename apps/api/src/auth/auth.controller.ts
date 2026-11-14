import { Controller, Get } from '@nestjs/common';
import { AllowPendingInvitation } from './invitation.guard';
import { UserRole } from '../generated/prisma/enums';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import type { AuthenticatedUser } from './auth.types';

@Controller('me')
@Roles(
  UserRole.OWNER,
  UserRole.DISPATCHER,
  UserRole.BACK_OFFICE,
  UserRole.DRIVER,
)
export class AuthController {
  @Get()
  @AllowPendingInvitation()
  getMe(@CurrentUser() user: AuthenticatedUser) {
    const { driverId, driverName, passwordAuthenticatedAt, ...identity } = user;
    void passwordAuthenticatedAt;
    return {
      ...identity,
      driver: driverId ? { id: driverId, name: driverName } : null,
    };
  }
}
