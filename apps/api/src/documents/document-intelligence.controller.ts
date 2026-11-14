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
import { IsBoolean, IsOptional } from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DocumentIntelligenceService } from './document-intelligence.service';
export class ProcessDocumentDto {
  @IsOptional() @IsBoolean() retry?: boolean;
}
@Controller('documents')
@Roles('OWNER', 'DISPATCHER')
export class DocumentIntelligenceController {
  constructor(private readonly intelligence: DocumentIntelligenceService) {}
  @Post(':id/intelligence')
  @Header('Cache-Control', 'private, no-store')
  process(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ProcessDocumentDto,
  ) {
    return this.intelligence.process(user, id, dto.retry);
  }
  @Get(':id/intake-preview')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async source(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const source = await this.intelligence.source(user, id);
    return new StreamableFile(source.bytes, {
      type: source.mime,
      disposition: 'inline',
    });
  }
}
