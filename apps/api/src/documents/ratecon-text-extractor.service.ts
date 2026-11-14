import type { AuthenticatedUser } from '../auth/auth.types';
import { BadRequestException, Injectable } from '@nestjs/common';

import { PDFParse } from 'pdf-parse';

import { CanvasFactory } from 'pdf-parse/worker';

import { DocumentStatus } from '../generated/prisma/enums';

import { DocumentsService } from './documents.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ExtractedDocumentText = {
  documentId: string;
  pageCount: number;
  text: string;
};

@Injectable()
export class RateConTextExtractorService {
  constructor(private readonly documentsService: DocumentsService) {}

  async extractPdfText(
    currentUser: AuthenticatedUser,
    documentId: string,
  ): Promise<ExtractedDocumentText> {
    if (!UUID_PATTERN.test(documentId)) {
      throw new BadRequestException('Invalid document ID.');
    }
    const document = await this.documentsService.findDocument(
      currentUser,
      documentId,
    );
    if (document.type !== 'RATE_CONFIRMATION')
      throw new BadRequestException(
        'Only Rate Confirmations can use this extraction workflow.',
      );

    /*
     * Read through DocumentsService instead
     * of constructing the storage path here.
     *
     * This keeps storage/version logic in one
     * place and preserves tenant validation.
     */
    const buffer = await this.documentsService.readStoredFile(
      currentUser,
      documentId,
    );

    const parser = new PDFParse({
      data: buffer,

      CanvasFactory,
    });

    try {
      const result = await parser.getText();

      const text = result.text?.trim() ?? '';

      if (!text) {
        throw new BadRequestException(
          'No readable text was found in this PDF.',
        );
      }

      /*
       * Only advance the document after
       * extraction succeeds.
       */
      await this.documentsService.advanceDocumentStatus(
        currentUser,
        documentId,
        DocumentStatus.TEXT_EXTRACTED,
      );

      return {
        documentId,

        pageCount: result.total,

        text,
      };
    } finally {
      await parser.destroy();
    }
  }
}
