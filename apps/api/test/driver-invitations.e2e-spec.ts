import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));
jest.mock('pdf-parse/worker', () => ({ CanvasFactory: class {} }));
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TokenVerifier } from '../src/auth/token-verifier';
import { DriverIdentityProvider } from '../src/integrations/supabase/driver-identity-provider';
import {
  database,
  id,
  orgA,
  driverA,
  foreignDriver,
} from './support/database-fixture';

describe('Day 7B invitations HTTP', () => {
  let app: INestApplication;
  let store: ReturnType<typeof database>;
  const newDriver = id(900),
    authId = id(901);
  const identities = {
    invite: jest.fn(),
    resend: jest.fn(),
    compensate: jest.fn(),
  };
  beforeEach(async () => {
    store = database();
    store.tables.driver.push({
      ...store.tables.driver[0],
      id: newDriver,
      userId: null,
      email: 'new-driver@example.com',
    });
    // Existing fixture originally had different profile/account emails.
    store.tables.driver[0].email = store.tables.user[2].email;
    identities.invite.mockReset().mockResolvedValue({
      id: authId,
      email: 'new-driver@example.com',
      operationId: 'owned-operation',
    });
    identities.resend.mockReset().mockResolvedValue(undefined);
    identities.compensate.mockReset().mockResolvedValue(true);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(store.db)
      .overrideProvider(DriverIdentityProvider)
      .useValue(identities)
      .overrideProvider(TokenVerifier)
      .useValue({
        verify: (token: string) => {
          const index = [
            'owner-a',
            'owner-b',
            'driver-a',
            'driver-b',
            'dispatcher',
            'back-office',
          ].indexOf(token);
          if (token === 'invited' || token === 'invited-otp')
            return Promise.resolve({
              sub: authId,
              ...(token === 'invited'
                ? { passwordAuthenticatedAt: Math.floor(Date.now() / 1000) }
                : {}),
            });
          if (index < 0) throw new UnauthorizedException();
          return Promise.resolve({ sub: id(200 + index) });
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  const api = (
    method: 'post' | 'get' | 'patch',
    path: string,
    token = 'owner-a',
    body: object = {},
  ) =>
    request(app.getHttpServer() as Server)
      [method](`/api/v1${path}`)
      .auth(token, { type: 'bearer' })
      .send(body);
  const invite = () => api('post', `/drivers/${newDriver}/invite`);
  const counts = () => [
    store.tables.user.length,
    store.tables.driver.length,
    store.tables.driverInvitation.length,
  ];
  it('provisions one DRIVER in the owner tenant, persists pending state and derives list/detail status', async () => {
    await invite().expect(200);
    expect(identities.invite).toHaveBeenCalledTimes(1);
    const user = store.tables.user.find((u) => u.authUserId === authId)!;
    expect(user).toMatchObject({
      role: 'DRIVER',
      organizationId: orgA,
      active: true,
    });
    expect(store.tables.driver.find((d) => d.id === newDriver)?.userId).toBe(
      user.id,
    );
    expect(store.tables.driverInvitation[0]).toMatchObject({
      authUserId: authId,
      driverId: newDriver,
      organizationId: orgA,
      status: 'PENDING',
    });
    const detail = await api('get', `/drivers/${newDriver}`).expect(200);
    expect(detail.body).toMatchObject({
      accountStatus: 'INVITE_PENDING',
      accountConnected: false,
    });
    expect(detail.body).not.toHaveProperty('authUserId');
    const list = await api('get', '/drivers').expect(200);
    expect(
      (list.body as { id: string; accountStatus: string }[]).find(
        (d) => d.id === newDriver,
      )?.accountStatus,
    ).toBe('INVITE_PENDING');
  });
  it.each(['dispatcher', 'back-office', 'driver-a'])(
    '%s cannot invite or resend',
    async (token) => {
      await api('post', `/drivers/${newDriver}/invite`, token).expect(403);
      await api('post', `/drivers/${newDriver}/invite/resend`, token).expect(
        403,
      );
      expect(identities.invite).not.toHaveBeenCalled();
    },
  );
  it.each(['invite', 'invite/resend'])(
    'foreign driver %s returns 404 without provider calls',
    async (action) => {
      await api('post', `/drivers/${foreignDriver}/${action}`).expect(404);
      expect(identities.invite).not.toHaveBeenCalled();
      expect(identities.resend).not.toHaveBeenCalled();
    },
  );
  it.each(['organizationId', 'authUserId', 'role'])(
    'rejects client authority %s',
    async (field) => {
      await api('post', `/drivers/${newDriver}/invite`, 'owner-a', {
        [field]: id(999),
      }).expect(400);
      expect(identities.invite).not.toHaveBeenCalled();
    },
  );
  it.each(['INACTIVE', 'NO_EMAIL'])('rejects %s driver', async (state) => {
    const driver = store.tables.driver.find((d) => d.id === newDriver)!;
    if (state === 'INACTIVE') driver.status = 'INACTIVE';
    else driver.email = null;
    await invite().expect(409);
    expect(identities.invite).not.toHaveBeenCalled();
  });
  it('initial invite is idempotent for pending and grandfathered connected accounts', async () => {
    await invite().expect(200);
    const before = counts();
    await invite().expect(200);
    await api('post', `/drivers/${driverA}/invite`).expect(200);
    expect(counts()).toEqual(before);
    expect(identities.invite).toHaveBeenCalledTimes(1);
  });
  it.each([409, 503])(
    'provider failure %s leaves no local mappings or compensation',
    async (status) => {
      const before = counts();
      identities.invite.mockRejectedValue(
        status === 409
          ? new ConflictException('existing')
          : new ServiceUnavailableException(),
      );
      await invite().expect(status);
      expect(counts()).toEqual(before);
      expect(
        store.tables.driver.find((d) => d.id === newDriver)?.userId,
      ).toBeNull();
      expect(identities.compensate).not.toHaveBeenCalled();
    },
  );
  it('database failure rolls back all writes and compensates only the newly-created identity', async () => {
    const before = counts();
    const db = store.db as unknown as {
      driverInvitation: { create: jest.Mock };
    };
    db.driverInvitation.create.mockRejectedValueOnce(
      new Error('simulated transaction failure'),
    );
    await invite().expect(503);
    expect(counts()).toEqual(before);
    expect(
      store.tables.driver.find((d) => d.id === newDriver)?.userId,
    ).toBeNull();
    expect(identities.compensate).toHaveBeenCalledWith({
      id: authId,
      email: 'new-driver@example.com',
      operationId: 'owned-operation',
    });
  });
  it('does not compensate when a committed mapping already exists', async () => {
    const db = store.db as unknown as {
      driverInvitation: { create: jest.Mock };
      user: { findUnique: jest.Mock };
    };
    db.driverInvitation.create.mockRejectedValueOnce(
      new Error('write failure'),
    );
    db.user.findUnique.mockImplementation(
      (q: { where: { authUserId: string } }) =>
        Promise.resolve(
          q.where.authUserId === authId
            ? { id: id(999) }
            : store.tables.user[0],
        ),
    );
    await invite().expect(503);
    expect(identities.compensate).not.toHaveBeenCalled();
  });
  it('resends pending after cooldown without duplicates, and rejects immediate repeats', async () => {
    await invite().expect(200);
    const before = counts();
    await api('post', `/drivers/${newDriver}/invite/resend`).expect(429);
    store.tables.driverInvitation[0].lastSentAt = new Date(Date.now() - 61000);
    await api('post', `/drivers/${newDriver}/invite/resend`).expect(200);
    expect(counts()).toEqual(before);
    expect(identities.resend).toHaveBeenCalledWith(
      authId,
      'new-driver@example.com',
    );
    expect(
      (store.tables.driverInvitation[0].lastSentAt as Date).getTime(),
    ).toBeGreaterThan(Date.now() - 5000);
    await api('post', `/drivers/${newDriver}/invite/resend`).expect(429);
    expect(identities.resend).toHaveBeenCalledTimes(1);
  });
  it('failed resend preserves lastSentAt', async () => {
    await invite().expect(200);
    const old = new Date(Date.now() - 61000);
    store.tables.driverInvitation[0].lastSentAt = old;
    identities.resend.mockRejectedValue(new ServiceUnavailableException());
    await api('post', `/drivers/${newDriver}/invite/resend`).expect(503);
    expect(store.tables.driverInvitation[0].lastSentAt).toEqual(old);
  });
  it('pending OTP session can read /me only; password authentication activates idempotently', async () => {
    await invite().expect(200);
    const me = await api('get', '/me', 'invited-otp').expect(200);
    expect(me.body).toMatchObject({
      role: 'DRIVER',
      organizationId: orgA,
      onboardingRequired: true,
      driver: { id: newDriver },
    });
    expect(me.body).not.toHaveProperty('passwordAuthenticatedAt');
    await api('get', '/me/loads', 'invited-otp').expect(403);
    await api('post', '/me/complete-invitation', 'invited-otp').expect(403);
    await api('post', '/me/complete-invitation', 'driver-a').expect(403);
    await api('post', '/me/complete-invitation', 'invited', {
      authUserId: authId,
    }).expect(400);
    await api('post', '/me/complete-invitation', 'invited').expect(200);
    expect(store.tables.driverInvitation[0]).toMatchObject({
      status: 'ACCEPTED',
    });
    expect(store.tables.driverInvitation[0].acceptedAt).toBeInstanceOf(Date);
    const at = store.tables.driverInvitation[0].acceptedAt;
    await api('post', '/me/complete-invitation', 'invited').expect(200);
    expect(store.tables.driverInvitation[0].acceptedAt).toEqual(at);
    const loads = await api('get', '/me/loads', 'invited').expect(200);
    expect((loads.body as { loads: unknown[] }).loads).toEqual([]);
    await api('post', `/drivers/${newDriver}/invite/resend`).expect(409);
    const connected = await api('get', `/drivers/${newDriver}`).expect(200);
    expect((connected.body as { accountStatus: string }).accountStatus).toBe(
      'CONNECTED',
    );
  });
  it('rejects a tampered invitation subject', async () => {
    await invite().expect(200);
    store.tables.driverInvitation[0].authUserId = id(999);
    await api('post', '/me/complete-invitation', 'invited').expect(409);
    expect(store.tables.driverInvitation[0].status).toBe('PENDING');
  });
  it('locks connected/pending email but allows other profile edits and unchanged email', async () => {
    await invite().expect(200);
    await api('patch', `/drivers/${newDriver}`, 'owner-a', {
      email: 'different@example.com',
    }).expect(409);
    await api('patch', `/drivers/${driverA}`, 'owner-a', {
      email: null,
    }).expect(409);
    await api('patch', `/drivers/${newDriver}`, 'owner-a', {
      email: 'new-driver@example.com',
      phone: '555-0100',
    }).expect(200);
  });
  it('deactivation denies invited session without deleting identity, Marcus still works', async () => {
    await invite().expect(200);
    await api('post', `/drivers/${newDriver}/deactivate`).expect(200);
    await api('get', '/me', 'invited').expect(403);
    await api('post', `/drivers/${newDriver}/invite/resend`).expect(409);
    await api('get', '/me/loads', 'driver-a').expect(200);
    expect(identities.compensate).not.toHaveBeenCalled();
  });
});
