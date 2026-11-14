import { Module } from '@nestjs/common';
import { SupabaseAdminModule } from '../integrations/supabase/supabase-admin.module';
import { DriverInvitationService } from './driver-invitation.service';
import {
  DriverInvitationController,
  CompleteDriverInvitationController,
} from './driver-invitation.controller';

import { DocumentsModule } from '../documents/documents.module';

import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { DriverManagementService } from './driver-management.service';
import { MeDriverController } from './me-driver.controller';
import { AutopilotModule } from '../autopilot/autopilot.module';
import { StopEventsService } from './stop-events.service';

@Module({
  imports: [DocumentsModule, AutopilotModule, SupabaseAdminModule],

  controllers: [
    DriversController,
    MeDriverController,
    DriverInvitationController,
    CompleteDriverInvitationController,
  ],

  providers: [
    DriversService,
    DriverManagementService,
    DriverInvitationService,
    StopEventsService,
  ],

  exports: [DriversService],
})
export class DriversModule {}
