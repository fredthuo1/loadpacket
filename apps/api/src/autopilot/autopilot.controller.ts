import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import { AutopilotService } from './autopilot.service';
import { OwnerAutopilotService } from './owner-autopilot.service';

@Roles(UserRole.OWNER, UserRole.DISPATCHER, UserRole.BACK_OFFICE)
@Controller('autopilot')
export class AutopilotController {
  constructor(
    private readonly autopilotService: AutopilotService,

    private readonly ownerAutopilotService: OwnerAutopilotService,
  ) {}

  @Roles(UserRole.OWNER, UserRole.DISPATCHER)
  @Get('owner/exceptions')
  getOwnerExceptions(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.ownerAutopilotService.getExceptions(currentUser);
  }

  @Get('loads/:loadId')
  getLoadAutopilot(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,
  ) {
    return this.autopilotService.getLoadAutopilot(currentUser, loadId);
  }

  @Get('loads/:loadId/timeline')
  getTimeline(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,
  ) {
    return this.autopilotService.getTimeline(currentUser, loadId);
  }
}
