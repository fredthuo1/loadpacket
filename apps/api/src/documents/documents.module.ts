import { Module } from '@nestjs/common';
import { DocumentIntelligenceController } from './document-intelligence.controller';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { RateConProcessor, LocalRateConProcessor } from './ratecon-processor';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';
import { DocumentStorage, LocalDocumentStorage } from './document-storage';
import { VaultService } from './vault.service';
import { DocumentDownloadService } from './document-download.service';
import { DocumentReviewService } from './document-review.service';
import { DocumentReviewController } from './document-review.controller';
import {
  VaultController,
  CompanyDocumentsController,
  DriverDocumentsController,
  DocumentDownloadController,
} from './vault.controller';

import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DriverDocumentCaptureService } from './driver-document-capture.service';
import { RateConDraftService } from './ratecon-draft.service';
import { RateConTextExtractorService } from './ratecon-text-extractor.service';

@Module({
  controllers: [
    DocumentIntelligenceController,
    SignaturesController,
    DocumentReviewController,
    VaultController,
    CompanyDocumentsController,
    DriverDocumentsController,
    DocumentDownloadController,
    DocumentsController,
  ],

  providers: [
    DocumentIntelligenceService,
    { provide: RateConProcessor, useClass: LocalRateConProcessor },
    SignaturesService,
    DocumentReviewService,
    { provide: DocumentStorage, useClass: LocalDocumentStorage },
    VaultService,
    DocumentDownloadService,
    DocumentsService,
    RateConTextExtractorService,
    RateConDraftService,
    DriverDocumentCaptureService,
  ],

  exports: [
    DocumentStorage,
    VaultService,
    DocumentsService,
    RateConTextExtractorService,
    RateConDraftService,
    DriverDocumentCaptureService,
  ],
})
export class DocumentsModule {}
