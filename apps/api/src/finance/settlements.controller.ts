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
  UseFilters,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FinanceDatabaseFilter } from './finance-database.filter';
import { SettlementsService } from './settlements.service';
import {
  CancelSettlementDto,
  EditSettlementDto,
  PrepareSettlementDto,
  SettlementCommand,
  SettlementPaymentDto,
  SettlementQuery,
} from './settlements.dto';

@Roles('OWNER', 'BACK_OFFICE')
@UseFilters(FinanceDatabaseFilter)
@Controller('finance/settlements')
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) {
    return this.settlements.list(user);
  }
  @Get('eligible') eligible(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SettlementQuery,
  ) {
    return this.settlements.eligible(user, query);
  }
  @Post() prepare(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PrepareSettlementDto,
  ) {
    return this.settlements.prepare(user, dto);
  }
  @Get(':id') detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.settlements.detail(user, id);
  }
  @Post(':id/edit') edit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: EditSettlementDto,
  ) {
    return this.settlements.edit(user, id, dto);
  }
  @Post(':id/review') review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: SettlementCommand,
  ) {
    return this.settlements.review(user, id, dto);
  }
  @Post(':id/approve') approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: SettlementCommand,
  ) {
    return this.settlements.approve(user, id, dto);
  }
  @Post(':id/cancel') cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CancelSettlementDto,
  ) {
    return this.settlements.cancel(user, id, dto);
  }
  @Post(':id/payments') pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: SettlementPaymentDto,
  ) {
    return this.settlements.pay(user, id, dto);
  }
  @Get(':id/statement')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async statement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return new StreamableFile(await this.settlements.download(user, id), {
      type: 'application/pdf',
      disposition: `attachment; filename="Settlement-${id}.pdf"`,
    });
  }
}
