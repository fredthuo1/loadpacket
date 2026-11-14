import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  UseFilters,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FinanceService } from './finance.service';
import { FinanceImportService } from './finance-import.service';
import {
  ConfirmImportDto,
  CreateFinancialTransactionDto,
  FinanceQuery,
  FinanceReasonDto,
  ImportMappingDto,
} from './finance.dto';
import { expenseCategories, incomeCategories, csv } from './finance-domain';
import { importFields } from './import-parser';
import { FinanceDatabaseFilter } from './finance-database.filter';

@Roles('OWNER', 'BACK_OFFICE')
@UseFilters(FinanceDatabaseFilter)
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly imports: FinanceImportService,
  ) {}
  @Get('categories') categories() {
    return {
      income: incomeCategories,
      expense: expenseCategories,
      importFields,
    };
  }
  @Get('overview') overview(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: FinanceQuery,
  ) {
    return this.finance.overview(u, q);
  }
  @Get('lookups') lookups(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: FinanceQuery,
  ) {
    return this.finance.lookups(u, q);
  }
  @Get('profitability') profitability(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: FinanceQuery,
  ) {
    return this.finance.profitability(u, q);
  }
  @Roles('OWNER') @Get('payroll') payroll(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: FinanceQuery,
  ) {
    return this.finance.payroll(u, q);
  }
  @Roles('OWNER')
  @Get('payroll/export')
  @Header('Cache-Control', 'private, no-store')
  async payrollExport(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: FinanceQuery,
  ) {
    return new StreamableFile(
      Buffer.from(await this.finance.payrollExport(u, q)),
      {
        type: 'text/csv; charset=utf-8',
        disposition: 'attachment; filename="LoadPacket-DriverPay.csv"',
      },
    );
  }
  @Get('transactions') list(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: FinanceQuery,
  ) {
    return this.finance.transactions(u, q);
  }
  @Get('transactions/:id') detail(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.finance.detail(u, id);
  }
  @Post('transactions') create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: CreateFinancialTransactionDto,
  ) {
    return this.finance.create(u, dto);
  }
  @Get('loads/:id') load(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.finance.loadSummary(u, id);
  }
  @Get('aging') aging(@CurrentUser() u: AuthenticatedUser) {
    return this.finance.aging(u);
  }
  @Get('audit') audit(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: FinanceQuery,
  ) {
    return this.finance.audit(u, q);
  }
  @Get('export') @Header('Cache-Control', 'private, no-store') async export(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: FinanceQuery,
  ) {
    return new StreamableFile(Buffer.from(await this.finance.export(u, q)), {
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="LoadPacket-Transactions.csv"',
    });
  }
  @Get('imports/template') template() {
    return new StreamableFile(
      Buffer.from(
        csv(
          [
            'Load Number',
            'Broker',
            'Origin',
            'Destination',
            'Delivery Date',
            'Gross Revenue',
            'Fuel Surcharge',
            'Fuel Expense',
            'Driver Pay',
            'Other Expenses',
            'Miles',
            'Invoice Number',
            'Due Date',
            'Payment Status',
            'Payment Date',
            'Driver',
            'Truck',
          ],
          [
            [
              'DEMO-100',
              'Fictional Freight',
              'Fictional Origin',
              'Fictional Destination',
              '2026-09-20',
              '3450.00',
              '200.00',
              '612.44',
              '350.00',
              '25.00',
              '800',
              'DEMO-INV-100',
              '2026-10-20',
              'PAID',
              '2026-09-25',
              'Alex Example',
              'Example 104',
            ],
          ],
        ),
      ),
      {
        type: 'text/csv; charset=utf-8',
        disposition: 'attachment; filename="LoadPacket-Import-Template.csv"',
      },
    );
  }
  @Get('imports') listImports(@CurrentUser() u: AuthenticatedUser) {
    return this.imports.list(u);
  }
  @Roles('OWNER')
  @Post('imports')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  upload(
    @CurrentUser() u: AuthenticatedUser,
    @UploadedFile() f: Express.Multer.File,
  ) {
    return this.imports.upload(u, f);
  }
  @Get('imports/:id') import(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.imports.detail(u, id);
  }
  @Roles('OWNER') @Post('imports/:id/preview') preview(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ImportMappingDto,
  ) {
    return this.imports.preview(u, id, dto);
  }
  @Roles('OWNER') @Post('imports/:id/confirm') confirm(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ConfirmImportDto,
  ) {
    return this.imports.confirm(u, id, dto);
  }
  @Roles('OWNER') @Post('imports/:id/reverse') reverse(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: FinanceReasonDto,
  ) {
    return this.imports.reverse(u, id, dto.reason);
  }
  @Roles('OWNER')
  @Get('imports/:id/source')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async source(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const b = await this.imports.get(u, id);
    return new StreamableFile(Buffer.from(b.fileBytes), {
      type: 'application/octet-stream',
      disposition: `attachment; filename="original-import.${b.fileName.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx'}"`,
    });
  }
}
