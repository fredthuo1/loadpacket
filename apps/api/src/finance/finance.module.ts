import { Module } from '@nestjs/common';
import { LoadsModule } from '../loads/loads.module';
import { FinanceService } from './finance.service';
import { FinanceImportService } from './finance-import.service';
import { FinanceController } from './finance.controller';
import { DocumentsModule } from '../documents/documents.module';
import { SettlementsService } from './settlements.service';
import { SettlementsController } from './settlements.controller';
@Module({
  imports: [LoadsModule, DocumentsModule],
  providers: [FinanceService, FinanceImportService, SettlementsService],
  controllers: [FinanceController, SettlementsController],
})
export class FinanceModule {}
