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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';
import { DocumentIntelligenceService } from './document-intelligence.service';

@Roles(UserRole.OWNER, UserRole.DISPATCHER, UserRole.BACK_OFFICE)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly intelligence: DocumentIntelligenceService,
  ) {}

  @Get(':documentId')
  getDocument(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
  ) {
    return this.documentsService.findDocument(currentUser, documentId);
  }
  @Roles(UserRole.OWNER, UserRole.DISPATCHER)
  @Post(':documentId/ratecon-draft')
  createRateConDraft(
    @Body() _body: EmptyCommandDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
  ) {
    void _body;
    return this.intelligence.process(currentUser, documentId);
  }
  @Roles(UserRole.OWNER, UserRole.DISPATCHER)
  @Post('ratecon')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
      },
    }),
  )
  uploadRateCon(
    @Body() _body: EmptyCommandDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    void _body;
    return this.documentsService.saveRateCon(currentUser, file);
  }

  @Roles(UserRole.OWNER, UserRole.DISPATCHER)
  @Post(':documentId/extract-text')
  async extractRateConText(
    @Body() _body: EmptyCommandDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
  ) {
    void _body;
    const result = await this.intelligence.process(currentUser, documentId);

    return {
      documentId: result.documentId,
      status:
        result.intelligence.status === 'SUCCEEDED'
          ? 'TEXT_EXTRACTED'
          : 'REVIEW_REQUIRED',
      pageCount: result.extraction.pageCount,
      characterCount: result.extraction.characterCount,

      // Compatibility response uses the same bounded, tenant-scoped cached run.
      textPreview: result.intelligence.pages
        .map((page) => page.text)
        .join('\n')
        .slice(0, 1500),
    };
  }
}
