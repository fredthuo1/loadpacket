import { DocumentsService } from './documents.service';
import { PrismaService } from '../database/prisma.service';
import { DocumentStorage } from './document-storage';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('Rate confirmation evidence preservation after a failed database response', () => {
  it.each(['committed', 'absent', 'unknown'])(
    '%s outcome keeps evidence unless absence is proven',
    async (outcome) => {
      const failure = new Error('Database response unavailable');
      const lookup =
        outcome === 'unknown'
          ? jest.fn().mockRejectedValue(failure)
          : jest
              .fn()
              .mockResolvedValue(
                outcome === 'committed' ? { id: 'persisted' } : null,
              );
      const prisma = {
        $transaction: jest.fn().mockRejectedValue(failure),
        document: { create: jest.fn().mockRejectedValue(failure) },
        documentVersion: { findFirst: lookup },
      } as unknown as PrismaService;
      const storage = {
        put: jest.fn().mockResolvedValue(undefined),
        removeUncommitted: jest.fn().mockResolvedValue(undefined),
      };
      const service = new DocumentsService(
        prisma,
        storage as unknown as DocumentStorage,
      );
      await expect(
        service.saveRateCon(
          { id: 'owner', organizationId: 'tenant' } as AuthenticatedUser,
          {
            mimetype: 'application/pdf',
            originalname: 'rate.pdf',
            size: 8,
            buffer: Buffer.from('%PDF-1.7\n%%EOF'),
          } as Express.Multer.File,
        ),
      ).rejects.toBe(failure);
      expect(storage.removeUncommitted).toHaveBeenCalledTimes(
        outcome === 'absent' ? 1 : 0,
      );
      expect(lookup.mock.calls[0] as unknown).toEqual([
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'tenant',
          }) as unknown,
        }),
      ]);
    },
  );
});
