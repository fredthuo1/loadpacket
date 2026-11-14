import { DriverActionDto } from './driver-action.dto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import {
  Controller,
  Body,
  Patch,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import { memoryStorage } from 'multer';

import { DriverDocumentCaptureService } from '../documents/driver-document-capture.service';

import { DocumentType } from '../generated/prisma/enums';

import { DriversService } from './drivers.service';
import { DriverManagementService } from './driver-management.service';
import {
  CreateDriverDto,
  UpdateDriverDto,
  DriverStatusCommandDto,
} from './driver-profile.dto';

@Roles(UserRole.OWNER, UserRole.DISPATCHER)
@Controller('drivers')
export class DriversController {
  constructor(
    private readonly management: DriverManagementService,
    private readonly driversService: DriversService,

    private readonly documentCaptureService: DriverDocumentCaptureService,
  ) {}

  @Get()
  findAll(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.management.list(currentUser);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDriverDto) {
    return this.management.create(user, dto);
  }

  @Get(':driverId')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.management.detail(user, id);
  }

  @Patch(':driverId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.management.update(user, id, dto);
  }

  @Post(':driverId/activate')
  @HttpCode(200)
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: DriverStatusCommandDto,
  ) {
    void body;
    return this.management.setStatus(user, id, 'ACTIVE');
  }

  @Post(':driverId/deactivate')
  @HttpCode(200)
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: DriverStatusCommandDto,
  ) {
    void body;
    return this.management.setStatus(user, id, 'INACTIVE');
  }

  @Get(':driverId/loads')
  findAssignedLoads(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'driverId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    driverId: string,
  ) {
    return this.driversService.findAssignedLoads(currentUser, driverId);
  }

  @Get(':driverId/loads/:loadId')
  findAssignedLoad(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'driverId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    driverId: string,

    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,
  ) {
    return this.driversService.findAssignedLoad(currentUser, driverId, loadId);
  }

  @Post(':driverId/loads/:loadId/accept')
  @HttpCode(HttpStatus.OK)
  acceptLoad(
    @Body() _body: DriverActionDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'driverId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    driverId: string,

    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,
  ) {
    void _body;
    return this.driversService.acceptLoad(
      currentUser,
      driverId,
      loadId,
      _body.actionToken,
    );
  }

  @Post(':driverId/loads/:loadId/start')
  @HttpCode(HttpStatus.OK)
  startLoad(
    @Body() _body: DriverActionDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'driverId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    driverId: string,

    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,
  ) {
    void _body;
    return this.driversService.startLoad(
      currentUser,
      driverId,
      loadId,
      _body.actionToken,
    );
  }

  @Post(':driverId/loads/:loadId/complete')
  @HttpCode(HttpStatus.OK)
  completeLoad(
    @Body() _body: DriverActionDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'driverId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    driverId: string,

    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,
  ) {
    void _body;
    return this.driversService.completeLoad(
      currentUser,
      driverId,
      loadId,
      _body.actionToken,
    );
  }

  @Post(':driverId/loads/:loadId/documents/:documentType')
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
  captureDocument(
    @Body() _body: DriverActionDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param(
      'driverId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    driverId: string,

    @Param(
      'loadId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    loadId: string,

    @Param('documentType', new ParseEnumPipe(DocumentType))
    documentType: DocumentType,

    @UploadedFile()
    file: Express.Multer.File,
  ) {
    void _body;
    return this.documentCaptureService.capture(
      currentUser,
      driverId,
      loadId,
      documentType,
      file,
      _body.actionToken,
    );
  }
}
