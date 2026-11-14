import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import { OwnerDashboardService } from './owner-dashboard.service';

@Roles(UserRole.OWNER, UserRole.DISPATCHER, UserRole.BACK_OFFICE)
@Controller('owner')
export class OwnerDashboardController {
  constructor(private readonly ownerDashboardService: OwnerDashboardService) {}

  @Roles(UserRole.OWNER, UserRole.DISPATCHER)
  @Get('dashboard')
  getDashboard(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.ownerDashboardService.getDashboard(currentUser);
  }

  @Get('loads/:loadId')
  getLoadOverview(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,
  ) {
    return this.ownerDashboardService.getLoadOverview(currentUser, loadId);
  }
}
