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

import { AccountsReceivableService } from './accounts-receivable.service';
import { RecordPaymentDto } from './record-payment.dto';

@Roles(UserRole.OWNER, UserRole.BACK_OFFICE)
@Controller('back-office/accounts-receivable')
export class AccountsReceivableController {
  constructor(
    private readonly accountsReceivableService: AccountsReceivableService,
  ) {}

  @Get()
  getDashboard(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.accountsReceivableService.getDashboard(currentUser);
  }

  @Post('loads/:loadId/mark-paid')
  @HttpCode(HttpStatus.OK)
  markPaid(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,

    @Body()
    dto: RecordPaymentDto,
  ) {
    return this.accountsReceivableService.markPaid(currentUser, loadId, dto);
  }
}
