import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../generated/prisma/enums';
import { VaultService } from './vault.service';
import { DocumentDownloadService } from './document-download.service';
import {
  CompanyDocumentUploadDto,
  DriverDocumentUploadDto,
  VersionUploadDto,
  VaultQueryDto,
} from './vault.dto';
import { DriverStatusCommandDto } from '../drivers/driver-profile.dto';
const fileInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 6 },
});
const uuid = () => new ParseUUIDPipe({ version: '4' });

@Controller('documents/vault')
@Roles(
  UserRole.OWNER,
  UserRole.DISPATCHER,
  UserRole.BACK_OFFICE,
  UserRole.DRIVER,
)
export class VaultController {
  constructor(
    private readonly vault: VaultService,
    private readonly downloads: DocumentDownloadService,
  ) {}
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: VaultQueryDto) {
    return this.vault.list(user, query);
  }
  @Get(':documentId')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', uuid()) id: string,
  ) {
    return this.vault.detail(user, id);
  }
  @Post(':documentId/versions')
  @Roles(UserRole.OWNER)
  @UseInterceptors(fileInterceptor)
  replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', uuid()) id: string,
    @Body() dto: VersionUploadDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.vault.upload(user, null, dto, file, id);
  }
  @Post(':documentId/versions/:versionId/download')
  @HttpCode(200)
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', uuid()) id: string,
    @Param('versionId', uuid()) versionId: string,
    @Body() dto: DriverStatusCommandDto,
  ) {
    void dto;
    return this.downloads.issue(user, id, versionId);
  }
}

@Controller('company/documents')
@Roles(UserRole.OWNER, UserRole.DISPATCHER, UserRole.BACK_OFFICE)
export class CompanyDocumentsController {
  constructor(private readonly vault: VaultService) {}
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.vault.list(user, { context: 'COMPANY' });
  }
  @Post()
  @Roles(UserRole.OWNER)
  @UseInterceptors(fileInterceptor)
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompanyDocumentUploadDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.vault.upload(
      user,
      { kind: 'COMPANY', type: dto.type },
      dto,
      file,
    );
  }
}

@Controller('drivers/:driverId/documents')
@Roles(UserRole.OWNER, UserRole.DRIVER)
export class DriverDocumentsController {
  constructor(private readonly vault: VaultService) {}
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('driverId', uuid()) id: string,
  ) {
    return this.vault.driverDocuments(user, id);
  }
  @Post()
  @Roles(UserRole.OWNER)
  @UseInterceptors(fileInterceptor)
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('driverId', uuid()) id: string,
    @Body() dto: DriverDocumentUploadDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.vault.upload(
      user,
      { kind: 'DRIVER', driverId: id, type: dto.type },
      dto,
      file,
    );
  }
}

@Controller('documents/vault-files')
export class DocumentDownloadController {
  constructor(private readonly downloads: DocumentDownloadService) {}
  // Authentication is the signed, expiring grant issued to an authorized User.
  // The service rechecks current account/tenant/document permissions on every use.
  @Get(':ticket')
  @Public()
  @Header('Cache-Control', 'private, no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(@Param('ticket') ticket: string) {
    const file = await this.downloads.download(ticket);
    const name = encodeURIComponent(file.fileName).replace(
      /['()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16)}`,
    );
    return new StreamableFile(file.bytes, {
      type: file.mimeType,
      disposition: `attachment; filename="document"; filename*=UTF-8''${name}`,
      length: file.bytes.length,
    });
  }
}
