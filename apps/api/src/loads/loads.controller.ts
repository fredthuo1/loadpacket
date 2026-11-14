import { LoadManagementService } from './load-management.service';
import { CorrectLoadDto, LoadCommandDto } from './load-management.dto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { AssignDriverDto } from './assign-driver.dto';
import { CreateLoadDto } from './create-load.dto';
import { CreateManualLoadDto } from './create-manual-load.dto';
import { LoadsService } from './loads.service';
import { ManualLoadsService } from './manual-loads.service';

@Roles(UserRole.OWNER, UserRole.DISPATCHER, UserRole.BACK_OFFICE)
@Controller('loads')
export class LoadsController {
  constructor(
    private readonly loadsService: LoadsService,
    private readonly management: LoadManagementService,

    private readonly manualLoadsService: ManualLoadsService,
  ) {}

  /*
   * RateCon-reviewed load creation.
   */
  @Roles(UserRole.OWNER, UserRole.DISPATCHER)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body()
    body: CreateLoadDto,
  ) {
    return this.loadsService.create(currentUser, body);
  }

  /*
   * Manual load creation.
   *
   * A manual load does not require or
   * fabricate a Rate Confirmation document.
   */
  @Roles(UserRole.OWNER, UserRole.DISPATCHER)
  @Post('manual')
  @HttpCode(HttpStatus.CREATED)
  createManual(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body()
    body: CreateManualLoadDto,
  ) {
    return this.manualLoadsService.create(currentUser, body);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.loadsService.getDashboard(currentUser);
  }

  @Roles(UserRole.OWNER, UserRole.DISPATCHER)
  @Post(':loadId/assign-driver')
  assignDriver(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,

    @Body()
    body: AssignDriverDto,
  ) {
    return this.loadsService.assignDriver(currentUser, loadId, body);
  }

  @Roles(UserRole.OWNER, UserRole.DISPATCHER)
  @Get(':loadId/management')
  managementDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.management.detail(user, id);
  }

  @Roles(UserRole.OWNER, UserRole.DISPATCHER)
  @Post(':loadId/correct')
  @HttpCode(200)
  correct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CorrectLoadDto,
  ) {
    return this.management.execute(user, id, 'correct', dto);
  }

  @Roles(UserRole.OWNER, UserRole.DISPATCHER)
  @Post(':loadId/unassign')
  @HttpCode(200)
  unassign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: LoadCommandDto,
  ) {
    return this.management.execute(user, id, 'unassign', dto);
  }

  @Roles(UserRole.OWNER, UserRole.DISPATCHER)
  @Post(':loadId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: LoadCommandDto,
  ) {
    return this.management.execute(user, id, 'cancel', dto);
  }

  @Get(':loadId')
  findOne(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,
  ) {
    return this.loadsService.findOne(currentUser, loadId);
  }
}
