import {
  BadRequestException,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

@Injectable()
export class DocumentsService {
  async saveRateCon(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Rate Confirmation file is required.');
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        'Only PDF, JPG, JPEG, and PNG files are supported.',
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File must be 10 MB or smaller.');
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty.');
    }

    const documentId = randomUUID();
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    const extension = this.resolveExtension(file);
    const storageDirectory = join(
      process.cwd(),
      'storage',
      'documents',
      documentId,
    );

    await mkdir(storageDirectory, { recursive: true });

    const storageFileName = `v1${extension}`;
    const storagePath = join(storageDirectory, storageFileName);

    await writeFile(storagePath, file.buffer);

    return {
      id: documentId,
      documentType: 'RATE_CONFIRMATION',
      version: 1,
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      checksum,
      status: 'UPLOADED',
      uploadedAt: new Date().toISOString(),
    };
  }

  private resolveExtension(file: Express.Multer.File): string {
    const originalExtension = extname(file.originalname).toLowerCase();

    if (
      originalExtension === '.pdf' ||
      originalExtension === '.jpg' ||
      originalExtension === '.jpeg' ||
      originalExtension === '.png'
    ) {
      return originalExtension;
    }

    switch (file.mimetype) {
      case 'application/pdf':
        return '.pdf';

      case 'image/jpeg':
        return '.jpg';

      case 'image/png':
        return '.png';

      default:
        throw new UnsupportedMediaTypeException(
          'Unable to determine supported file type.',
        );
    }
  }
}