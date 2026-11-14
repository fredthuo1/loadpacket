import { bootstrapAuth } from '../../prisma/bootstrap-auth';
import type { PrismaClient } from '../generated/prisma/client';

describe('optional development auth bootstrap', () => {
  const authId = '00000000-0000-4000-8000-000000000001';
  const savedOwner = process.env.DEV_OWNER_AUTH_USER_ID;
  const savedDriver = process.env.DEV_DRIVER_AUTH_USER_ID;
  let log: jest.SpyInstance;

  beforeEach(() => {
    delete process.env.DEV_OWNER_AUTH_USER_ID;
    delete process.env.DEV_DRIVER_AUTH_USER_ID;
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    log.mockRestore();
    if (savedOwner === undefined) delete process.env.DEV_OWNER_AUTH_USER_ID;
    else process.env.DEV_OWNER_AUTH_USER_ID = savedOwner;
    if (savedDriver === undefined) delete process.env.DEV_DRIVER_AUTH_USER_ID;
    else process.env.DEV_DRIVER_AUTH_USER_ID = savedDriver;
  });

  function database() {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'application-user' }),
      },
      driver: {
        findFirst: jest.fn().mockResolvedValue({ userId: null }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const transaction = jest.fn((work: (value: typeof tx) => Promise<void>) =>
      work(tx),
    );
    return {
      tx,
      transaction,
      prisma: { $transaction: transaction } as unknown as PrismaClient,
    };
  }

  it('skips absent auth IDs without database writes', async () => {
    const db = database();
    await bootstrapAuth(db.prisma, 'organization', 'driver');
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('creates the mapping and links only the scoped driver', async () => {
    process.env.DEV_DRIVER_AUTH_USER_ID = authId;
    const db = database();
    await bootstrapAuth(db.prisma, 'organization', 'driver');
    expect(db.tx.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {},
        create: expect.objectContaining({
          authUserId: authId,
          organizationId: 'organization',
          role: 'DRIVER',
        }) as unknown,
      }),
    );
    expect(db.tx.driver.findFirst).toHaveBeenCalledWith({
      where: { id: 'driver', organizationId: 'organization' },
    });
    expect(db.tx.driver.update).toHaveBeenCalledWith({
      where: { id: 'driver', organizationId: 'organization' },
      data: { userId: 'application-user' },
    });
  });
  it.each([
    { organizationId: 'foreign', role: 'OWNER' },
    { organizationId: 'organization', role: 'DRIVER' },
  ])(
    'refuses an existing user with conflicting tenant or role: %j',
    async (existing) => {
      process.env.DEV_OWNER_AUTH_USER_ID = authId;
      const db = database();
      db.tx.user.findUnique.mockResolvedValue(existing);
      await expect(
        bootstrapAuth(db.prisma, 'organization', 'driver'),
      ).rejects.toThrow('refuses to move');
      expect(db.tx.user.upsert).not.toHaveBeenCalled();
    },
  );
  it('refuses to replace an existing driver mapping', async () => {
    process.env.DEV_DRIVER_AUTH_USER_ID = authId;
    const db = database();
    db.tx.driver.findFirst.mockResolvedValue({ userId: 'another-user' });
    await expect(
      bootstrapAuth(db.prisma, 'organization', 'driver'),
    ).rejects.toThrow('refuses to replace');
    expect(db.tx.driver.update).not.toHaveBeenCalled();
  });
});
