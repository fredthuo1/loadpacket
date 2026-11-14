import { Global, Module } from '@nestjs/common';

import { LoadEventsService } from './load-events.service';

@Global()
@Module({
  providers: [LoadEventsService],

  exports: [LoadEventsService],
})
export class LoadEventsModule {}
