import { Module } from '@nestjs/common';
import { FinanceModule } from './finance/finance.module';
import { AuthModule } from './auth/auth.module';
import { CompanyModule } from './company/company.module';

import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { DriversModule } from './drivers/drivers.module';
import { LoadsModule } from './loads/loads.module';
import { LoadEventsModule } from './load-events/load-events.module';
import { AutopilotModule } from './autopilot/autopilot.module';
import { AgreementsModule } from './agreements/agreements.module';
import { MoneyOpportunitiesModule } from './money-opportunities/money-opportunities.module';
import { ExternalModule } from './external/external.module';

@Module({
  imports: [
    FinanceModule,
    DatabaseModule,
    AuthModule,
    CompanyModule,
    DocumentsModule,
    DriversModule,
    LoadsModule,
    LoadEventsModule,
    AutopilotModule,
    AgreementsModule,
    MoneyOpportunitiesModule,
    ExternalModule,
  ],

  controllers: [AppController],
})
export class AppModule {}
