import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DocumentReviewService } from './document-review.service';
import {
  AcceptDocumentDto,
  RejectDocumentDto,
  WaiveDocumentDto,
} from './document-review.dto';
const uuid = () => new ParseUUIDPipe({ version: '4' });
@Controller('back-office/loads/:loadId/requirements')
@Roles('OWNER', 'BACK_OFFICE')
export class DocumentReviewController {
  constructor(private readonly review: DocumentReviewService) {}
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', uuid()) loadId: string,
  ) {
    return this.review.list(user, loadId);
  }
  @Post(':requirementId/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', uuid()) loadId: string,
    @Param('requirementId', uuid()) requirementId: string,
    @Body() dto: AcceptDocumentDto,
  ) {
    return this.review.review(
      user,
      loadId,
      requirementId,
      'ACCEPTED',
      dto.versionId,
    );
  }
  @Post(':requirementId/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', uuid()) loadId: string,
    @Param('requirementId', uuid()) requirementId: string,
    @Body() dto: RejectDocumentDto,
  ) {
    return this.review.review(
      user,
      loadId,
      requirementId,
      'REJECTED',
      dto.versionId,
      dto.reason,
    );
  }
  @Post(':requirementId/waive')
  @HttpCode(200)
  waive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', uuid()) loadId: string,
    @Param('requirementId', uuid()) requirementId: string,
    @Body() dto: WaiveDocumentDto,
  ) {
    return this.review.review(
      user,
      loadId,
      requirementId,
      'WAIVED',
      dto.versionId,
      dto.reason,
    );
  }
}
