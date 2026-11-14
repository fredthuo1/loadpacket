import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SignaturesService } from './signatures.service';
import { CaptureSignatureDto } from './signature.dto';
@Controller('documents/:documentId/signatures')
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}
  @Post()
  @Roles('DRIVER')
  capture(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
    @Body() body: CaptureSignatureDto,
  ) {
    return this.signatures.capture(user, documentId, body);
  }
  @Get()
  @Roles('DRIVER', 'OWNER', 'BACK_OFFICE', 'DISPATCHER')
  @Header('Cache-Control', 'private, no-store')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
  ) {
    return this.signatures.list(user, documentId);
  }
  @Get(':signatureId/content')
  @Roles('DRIVER', 'OWNER', 'BACK_OFFICE', 'DISPATCHER')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async content(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
    @Param('signatureId', new ParseUUIDPipe({ version: '4' }))
    signatureId: string,
  ) {
    return new StreamableFile(
      await this.signatures.content(user, documentId, signatureId),
      { type: 'image/png', disposition: 'inline; filename="signature.png"' },
    );
  }
}
