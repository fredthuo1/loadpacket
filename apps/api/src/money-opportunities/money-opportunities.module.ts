import { Module } from '@nestjs/common';

import { MoneyOpportunitiesController } from './money-opportunities.controller';
import { MoneyOpportunitiesService } from './money-opportunities.service';
import { DetentionService } from './detention.service';

@Module({
  controllers: [MoneyOpportunitiesController],

  providers: [MoneyOpportunitiesService, DetentionService],

  exports: [MoneyOpportunitiesService],
})
export class MoneyOpportunitiesModule {}
