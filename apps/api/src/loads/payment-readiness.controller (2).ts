import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { CarrierInvoiceService } from './carrier-invoice.service';
import { PaymentReadinessService } from './payment-readiness.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/enums';

@Controller('back-office')
@Roles(UserRole.OWNER, UserRole.BACK_OFFICE)
export class PaymentReadinessController {
  constructor(
    private readonly paymentReadinessService: PaymentReadinessService,

    private readonly carrierInvoiceService: CarrierInvoiceService,
  ) {}

  @Get('queue')
  getQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentReadinessService.getQueue(user);
  }

  @Get('loads/:loadId/readiness')
  getLoadReadiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,
  ) {
    return this.paymentReadinessService.getLoadReadiness(user, loadId);
  }

  @Post('loads/:loadId/carrier-invoice')
  @HttpCode(HttpStatus.CREATED)
  generateCarrierInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,
  ) {
    return this.carrierInvoiceService.generate(user, loadId);
  }
}
