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
} from '@nestjs/common';

import { AgreementsService } from './agreements.service';

import { AcceptAgreementDto } from './accept-agreement.dto';

@Roles(UserRole.OWNER, UserRole.DISPATCHER, UserRole.BACK_OFFICE)
@Controller('agreements')
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  @Roles(UserRole.OWNER, UserRole.DISPATCHER)
  @Post('loads/:loadId/rate-confirmation')
  @HttpCode(HttpStatus.CREATED)
  createRateConfirmationAgreement(
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
    return this.agreements.createRateConfirmationAgreement(currentUser, loadId);
  }

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
    return this.agreements.findForLoad(currentUser, loadId);
  }

  @Get(':agreementId')
  findOne(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'agreementId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    agreementId: string,
  ) {
    return this.agreements.getById(currentUser, agreementId);
  }

  @Roles(UserRole.OWNER, UserRole.DISPATCHER)
  @Post(':agreementId/accept')
  accept(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'agreementId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    agreementId: string,

    @Body()
    body: AcceptAgreementDto,
  ) {
    return this.agreements.accept(currentUser, agreementId, body);
  }
}
