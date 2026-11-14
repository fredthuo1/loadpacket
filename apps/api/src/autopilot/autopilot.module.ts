import { Module } from '@nestjs/common';

import { AutopilotController } from './autopilot.controller';
import { AutopilotService } from './autopilot.service';
import { OwnerAutopilotService } from './owner-autopilot.service';

@Module({
  controllers: [AutopilotController],

  providers: [AutopilotService, OwnerAutopilotService],

  exports: [AutopilotService, OwnerAutopilotService],
})
export class AutopilotModule {}
