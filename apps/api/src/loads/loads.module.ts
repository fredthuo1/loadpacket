import { LoadManagementService } from './load-management.service';
import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';

import { AccountsReceivableController } from './accounts-receivable.controller';
import { AccountsReceivableService } from './accounts-receivable.service';
import { BillingPacketService } from './billing-packet.service';
import { BillingSubmissionService } from './billing-submission.service';
import { CarrierInvoiceService } from './carrier-invoice.service';
import { LoadsController } from './loads.controller';
import { LoadsService } from './loads.service';
import { ManualLoadsService } from './manual-loads.service';
import { OwnerDashboardController } from './owner-dashboard.controller';
import { OwnerDashboardService } from './owner-dashboard.service';
import { PaymentReadinessController } from './payment-readiness.controller';
import { PaymentReadinessService } from './payment-readiness.service';

@Module({
  imports: [DocumentsModule],
  controllers: [
    LoadsController,
    PaymentReadinessController,
    AccountsReceivableController,
    OwnerDashboardController,
  ],

  providers: [
    LoadManagementService,
    LoadsService,
    ManualLoadsService,
    PaymentReadinessService,
    CarrierInvoiceService,
    BillingPacketService,
    BillingSubmissionService,
    AccountsReceivableService,
    OwnerDashboardService,
  ],

  exports: [
    LoadManagementService,
    LoadsService,
    ManualLoadsService,
    PaymentReadinessService,
    CarrierInvoiceService,
    BillingPacketService,
    BillingSubmissionService,
    AccountsReceivableService,
    OwnerDashboardService,
  ],
})
export class LoadsModule {}
