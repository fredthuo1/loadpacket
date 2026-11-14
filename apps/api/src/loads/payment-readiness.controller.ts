import { GenerateInvoiceDto } from './generate-invoice.dto';
import { EmptyCommandDto } from '../common/empty-command.dto';
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
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';

import type { Response } from 'express';

import { BillingPacketService } from './billing-packet.service';
import { BillingSubmissionService } from './billing-submission.service';
import { CarrierInvoiceService } from './carrier-invoice.service';
import { PaymentReadinessService } from './payment-readiness.service';
import { SubmitBillingDto } from './submit-billing.dto';

@Roles(UserRole.OWNER, UserRole.BACK_OFFICE)
@Controller('back-office')
export class PaymentReadinessController {
  constructor(
    private readonly paymentReadinessService: PaymentReadinessService,

    private readonly carrierInvoiceService: CarrierInvoiceService,

    private readonly billingPacketService: BillingPacketService,

    private readonly billingSubmissionService: BillingSubmissionService,
  ) {}

  @Get('queue')
  getQueue(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.paymentReadinessService.getQueue(currentUser);
  }

  @Get('loads/:loadId/invoices')
  invoices(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) loadId: string,
  ) {
    return this.carrierInvoiceService.preview(user, loadId);
  }

  @Post('loads/:loadId/invoices/:invoiceId/submit')
  submitSupplement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) loadId: string,
    @Param('invoiceId', new ParseUUIDPipe({ version: '4' })) invoiceId: string,
    @Body() _body: EmptyCommandDto,
  ) {
    void _body;
    return this.carrierInvoiceService.submitSupplement(user, loadId, invoiceId);
  }

  @Get('loads/:loadId/readiness')
  getLoadReadiness(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,
  ) {
    return this.paymentReadinessService.getLoadReadiness(currentUser, loadId);
  }

  @Post('loads/:loadId/carrier-invoice')
  @HttpCode(HttpStatus.CREATED)
  generateCarrierInvoice(
    @Body() body: GenerateInvoiceDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,
  ) {
    return this.carrierInvoiceService.generate(currentUser, loadId, body);
  }

  @Get('loads/:loadId/billing-packet')
  async downloadBillingPacket(
    @Query('invoiceId', new ParseUUIDPipe({ version: '4', optional: true }))
    invoiceId: string | undefined,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,

    @Res({
      passthrough: true,
    })
    response: Response,
  ) {
    const packet = await this.billingPacketService.generate(
      currentUser,
      loadId,
      invoiceId,
    );

    response.setHeader('Content-Type', 'application/pdf');

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${packet.fileName}"`,
    );

    response.setHeader('Content-Length', packet.buffer.length.toString());

    return new StreamableFile(packet.buffer);
  }

  @Post('loads/:loadId/submit-billing')
  @HttpCode(HttpStatus.OK)
  submitBilling(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,

    @Body()
    dto: SubmitBillingDto,
  ) {
    return this.billingSubmissionService.submit(currentUser, loadId, dto);
  }
}
