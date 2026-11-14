import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { ExternalService } from './external.service';
import {
  BrokerAccessController,
  ExternalController,
} from './external.controller';
@Module({
  imports: [DocumentsModule],
  controllers: [BrokerAccessController, ExternalController],
  providers: [ExternalService],
})
export class ExternalModule {}
