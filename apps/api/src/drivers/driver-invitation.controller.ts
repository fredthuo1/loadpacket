import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { AllowPendingInvitation } from '../auth/invitation.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../generated/prisma/enums';
import { DriverStatusCommandDto } from './driver-profile.dto';
import { DriverInvitationService } from './driver-invitation.service';
@Controller('drivers')
@Roles(UserRole.OWNER)
export class DriverInvitationController {
  constructor(private readonly invitations: DriverInvitationService) {}
  @Post(':driverId/invite')
  @HttpCode(200)
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: DriverStatusCommandDto,
  ) {
    void body;
    return this.invitations.invite(user, id);
  }
  @Post(':driverId/invite/resend')
  @HttpCode(200)
  resend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: DriverStatusCommandDto,
  ) {
    void body;
    return this.invitations.resend(user, id);
  }
}
@Controller('me')
@Roles(UserRole.DRIVER)
export class CompleteDriverInvitationController {
  constructor(private readonly invitations: DriverInvitationService) {}
  @Post('complete-invitation')
  @HttpCode(200)
  @AllowPendingInvitation()
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: DriverStatusCommandDto,
  ) {
    void body;
    return this.invitations.complete(user);
  }
}
