import { BadRequestException } from '@nestjs/common';
import { BillingPacketService } from './billing-packet.service';
import { PrismaService } from '../database/prisma.service';
import { DocumentStorage } from '../documents/document-storage';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('Billing packet approved evidence integrity', () => {
  it('refuses a packet when the reviewed version is absent instead of silently omitting it', async () => {
    const prisma = {
      carrierInvoice: { findFirst: jest.fn().mockResolvedValue(null) },
      load: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'PAYMENT_READY',
          loadNumber: 'TEST',
          brokerName: 'Test',
          totalRate: '100.00',
          stops: [],
          requirements: [
            {
              id: 'req',
              documentType: 'POD',
              requirement: 'REQUIRED',
              status: 'ACCEPTED',
              reviewedVersionId: 'approved',
            },
          ],
          documents: [
            { role: 'POD', document: { versions: [{ id: 'unreviewed' }] } },
          ],
        }),
      },
    } as unknown as PrismaService;
    const storage = { read: jest.fn() };
    const service = new BillingPacketService(
      prisma,
      storage as unknown as DocumentStorage,
    );
    await expect(
      service.generate(
        { organizationId: 'tenant' } as AuthenticatedUser,
        'load',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(storage.read).not.toHaveBeenCalled();
  });
});
