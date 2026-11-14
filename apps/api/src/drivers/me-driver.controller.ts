import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DocumentType, UserRole } from '../generated/prisma/enums';
import { DriverDocumentCaptureService } from '../documents/driver-document-capture.service';
import { AutopilotService } from '../autopilot/autopilot.service';
import { DriversService } from './drivers.service';
import { StopEventsService } from './stop-events.service';
import { StopEventDto } from './stop-event.dto';
import { nextStopAction } from './stop-policy';

import { DriverActionDto } from './driver-action.dto';

@Controller('me/loads')
@Roles(UserRole.DRIVER)
export class MeDriverController {
  constructor(
    private readonly drivers: DriversService,
    private readonly capture: DriverDocumentCaptureService,
    private readonly autopilot: AutopilotService,
    private readonly stopEvents: StopEventsService,
  ) {}

  private driverId(user: AuthenticatedUser) {
    if (!user.driverId)
      throw new ForbiddenException('An active driver mapping is required.');
    return user.driverId;
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.drivers.findAssignedLoads(user, this.driverId(user));
  }

  @Get(':loadId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) loadId: string,
  ) {
    return this.drivers.findAssignedLoad(user, this.driverId(user), loadId);
  }

  @Get(':loadId/autopilot')
  async getAutopilot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) loadId: string,
  ) {
    const assigned = await this.drivers.findAssignedLoad(
      user,
      this.driverId(user),
      loadId,
    );
    const result = await this.autopilot.getLoadAutopilot(user, loadId);
    // Only expose the driver action/guard; financial opportunities and owner audit data stay private.
    const driverEvents = new Set([
      'DRIVER_ASSIGNED',
      'DRIVER_ACCEPTED',
      'LOAD_STARTED',
      'DOCUMENT_CAPTURED',
      'DELIVERY_CONFIRMED',
      'LOAD_COMPLETED',
      'ARRIVED_PICKUP',
      'DEPARTED_PICKUP',
      'ARRIVED_DELIVERY',
      'DEPARTED_DELIVERY',
    ]);
    return {
      driverAction: result.driverAction,
      stopAction: nextStopAction(assigned.load.stops),
      deliveryGuard: result.deliveryGuard,
      paperwork: result.paperwork,
      timeline: result.timeline
        .filter((event) => driverEvents.has(event.type))
        .map(({ id, type, label, occurredAt }) => ({
          id,
          type,
          label,
          occurredAt,
        })),
    };
  }

  @Post(':loadId/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) loadId: string,
    @Body() _body: DriverActionDto,
  ) {
    void _body;
    return this.drivers.acceptLoad(
      user,
      this.driverId(user),
      loadId,
      _body.actionToken,
    );
  }

  @Post(':loadId/stops/:stopId/arrive')
  @HttpCode(200)
  arrive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) loadId: string,
    @Param('stopId', new ParseUUIDPipe({ version: '4' })) stopId: string,
    @Body() body: StopEventDto,
  ) {
    return this.stopEvents.record(user, loadId, stopId, 'arrive', body);
  }

  @Post(':loadId/stops/:stopId/depart')
  @HttpCode(200)
  depart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) loadId: string,
    @Param('stopId', new ParseUUIDPipe({ version: '4' })) stopId: string,
    @Body() body: StopEventDto,
  ) {
    return this.stopEvents.record(user, loadId, stopId, 'depart', body);
  }

  @Post(':loadId/start')
  @HttpCode(200)
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) loadId: string,
    @Body() _body: DriverActionDto,
  ) {
    void _body;
    return this.drivers.startLoad(
      user,
      this.driverId(user),
      loadId,
      _body.actionToken,
    );
  }

  @Post(':loadId/complete')
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) loadId: string,
    @Body() _body: DriverActionDto,
  ) {
    void _body;
    return this.drivers.completeLoad(
      user,
      this.driverId(user),
      loadId,
      _body.actionToken,
    );
  }

  @Post(':loadId/documents/:documentType')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) loadId: string,
    @Param('documentType', new ParseEnumPipe(DocumentType)) type: DocumentType,
    @UploadedFile() file: Express.Multer.File,
    @Body() _body: DriverActionDto,
  ) {
    void _body;
    return this.capture.capture(
      user,
      this.driverId(user),
      loadId,
      type,
      file,
      _body.actionToken,
    );
  }
}
