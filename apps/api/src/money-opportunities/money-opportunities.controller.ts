import { EmptyCommandDto } from '../common/empty-command.dto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { MoneyOpportunitiesService } from './money-opportunities.service';

import { SetAmountDto } from './set-amount.dto';
import { DetentionTermsDto } from './detention-terms.dto';
import { DetentionService } from './detention.service';

@Roles(UserRole.OWNER, UserRole.BACK_OFFICE)
@Controller('money-opportunities')
export class MoneyOpportunitiesController {
  constructor(
    private readonly moneyOpportunities: MoneyOpportunitiesService,
    private readonly detention: DetentionService,
  ) {}

  @Post('loads/:loadId/detention-terms')
  confirmTerms(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) loadId: string,
    @Body() body: DetentionTermsDto,
  ) {
    return this.detention.confirmTerms(user, loadId, body);
  }

  @Post('loads/:loadId/scan')
  scanLoad(
    @Body() _body: EmptyCommandDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,
  ) {
    void _body;
    return this.moneyOpportunities.scanLoad(currentUser, loadId);
  }

  @Roles(UserRole.OWNER, UserRole.DISPATCHER, UserRole.BACK_OFFICE)
  @Get('loads/:loadId')
  findForLoad(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,
  ) {
    return this.moneyOpportunities.findForLoad(currentUser, loadId);
  }

  @Patch(':opportunityId/amount')
  setAmount(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'opportunityId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    opportunityId: string,

    @Body()
    body: SetAmountDto,
  ) {
    return this.moneyOpportunities.setAmount(currentUser, opportunityId, body);
  }

  @Post(':opportunityId/approve')
  approve(
    @Body() _body: EmptyCommandDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'opportunityId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    opportunityId: string,
  ) {
    void _body;
    return this.moneyOpportunities.approve(currentUser, opportunityId);
  }

  @Post(':opportunityId/dismiss')
  dismiss(
    @Body() _body: EmptyCommandDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'opportunityId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    opportunityId: string,
  ) {
    void _body;
    return this.moneyOpportunities.dismiss(currentUser, opportunityId);
  }
}
