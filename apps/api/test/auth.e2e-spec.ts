import { driverActionToken } from '../src/loads/load-action-token';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));
jest.mock('pdf-parse/worker', () => ({ CanvasFactory: class {} }));
jest.mock('node:fs/promises', () => ({
  ...jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises'),
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
}));

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { Prisma } from '../src/generated/prisma/client';
import { TokenVerifier } from '../src/auth/token-verifier';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';

import {
  database,
  id,
  orgA,
  orgB,
  loadA,
  loadB,
  otherDriverLoad,
  driverA,
  driverB,
  foreignDriver,
  documentB,
  agreementB,
  opportunityB,
  type Row,
} from './support/database-fixture';

describe('Day 7 authentication and tenant isolation (real controller/service paths)', () => {
  let app: INestApplication;
  let actionToken: string;
  let store: ReturnType<typeof database>;
  const tokens = [
    'owner-a',
    'owner-b',
    'driver-a',
    'driver-b',
    'dispatcher',
    'back-office',
    'inactive',
    'unlinked-driver',
  ];
  beforeEach(async () => {
    store = database();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(store.db)
      .overrideProvider(TokenVerifier)
      .useValue({
        verify: jest.fn((token: string) => {
          const i = tokens.indexOf(token);
          if (i < 0)
            throw new UnauthorizedException('Invalid or expired access token.');
          return Promise.resolve({ sub: id(200 + i) });
        }),
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new PrismaExceptionFilter());
    await app.init();
    actionToken = await driverActionToken(
      app.get(PrismaService),
      orgA,
      loadA,
      driverA,
    );
  });
  afterEach(async () => {
    await app.close();
  });
  const get = (path: string, token?: string) => {
    const r = request(app.getHttpServer() as Server).get(`/api/v1${path}`);
    return token ? r.auth(token, { type: 'bearer' }) : r;
  };
  const post = (path: string, token: string, body: Row = {}) =>
    request(app.getHttpServer() as Server)
      .post(`/api/v1${path}`)
      .auth(token, { type: 'bearer' })
      .send(
        /^\/me\/loads\/[^/]+\/(accept|start|complete)$/.test(path)
          ? { actionToken, ...body }
          : body,
      );

  it.each(['/health', '/health/database'])('keeps %s public', async (path) => {
    await get(path).expect(200);
  });
  it('reports missing Finance schema without changing authentication or leaking database details', async () => {
    const rawQuery = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Private SQL', {
        code: 'P2010',
        clientVersion: '7.10.0',
        meta: { driverAdapterError: { cause: { originalCode: '42P01' } } },
      }),
    );
    Object.assign(store.db, { $queryRaw: rawQuery });
    await get('/finance/transactions').expect(401);
    await get('/finance/transactions', 'driver-a').expect(403);
    expect(rawQuery).not.toHaveBeenCalled();
    const response = await get('/finance/transactions', 'owner-a').expect(503);
    expect(response.body).toHaveProperty('code', 'FINANCE_SETUP_REQUIRED');
    expect(response.text).not.toContain('Private SQL');
    await get('/me', 'owner-a').expect(200);
  });
  it.each([
    '/me',
    '/owner/dashboard',
    '/loads/' + loadA,
    '/drivers',
    '/back-office/queue',
    '/agreements/' + agreementB,
    '/money-opportunities/loads/' + loadA,
  ])('rejects anonymous %s', async (path) => {
    await get(path).expect(401);
  });
  it.each(['invalid', 'expired'])('rejects %s tokens', async (token) => {
    await get('/me', token).expect(401);
  });
  it('rejects inactive application users', async () => {
    await get('/me', 'inactive').expect(403);
  });
  it('rejects a driver without a mapping', async () => {
    await get('/me', 'unlinked-driver').expect(403);
  });
  it('rejects unknown application users', async () => {
    store.tables.user = store.tables.user.filter((u) => u.id !== id(100));
    await get('/me', 'owner-a').expect(403);
  });
  it('returns the application identity and role', async () => {
    const response = await get('/me', 'owner-a').expect(200);
    expect(response.body).toMatchObject({
      id: id(100),
      organizationId: orgA,
      role: 'OWNER',
      driver: null,
    });
  });
  it('returns Marcus from his authenticated mapping', async () => {
    const response = await get('/me', 'driver-a').expect(200);
    expect(response.body).toMatchObject({
      role: 'DRIVER',
      driver: { id: driverA, name: 'Marcus Reed' },
    });
  });
  it.each([
    ['owner-a', loadB],
    ['owner-b', loadA],
  ])('prevents %s from fetching the other tenant load', async (token, load) => {
    await get('/loads/' + load, token).expect(404);
  });
  it('allows an owner to fetch their load', async () => {
    const response = await get('/loads/' + loadA, 'owner-a').expect(200);
    expect(response.body).toMatchObject({ id: loadA });
  });
  it.each([
    '/owner/dashboard',
    '/drivers',
    '/loads/' + loadA,
    '/back-office/queue',
    '/back-office/accounts-receivable',
    '/agreements/' + agreementB,
    '/money-opportunities/loads/' + loadA,
    '/autopilot/loads/' + loadA,
  ])('denies driver access to staff route %s', async (path) => {
    await get(path, 'driver-a').expect(403);
  });
  it.each(['dispatcher', 'back-office', 'owner-a'])(
    'denies staff %s the driver-only me route',
    async (token) => {
      await get('/me/loads', token).expect(403);
    },
  );
  it('lists only Marcus assignments', async () => {
    const response = await get('/me/loads', 'driver-a').expect(200);
    expect(response.body).toMatchObject({
      driver: { id: driverA },
      loads: [{ load: { id: loadA } }],
    });
    expect((response.body as { loads: unknown[] }).loads).toHaveLength(1);
  });
  it('allows Marcus own load', async () => {
    await get('/me/loads/' + loadA, 'driver-a').expect(200);
  });
  it.each([
    ['driver-a', otherDriverLoad],
    ['driver-b', loadA],
    ['driver-a', loadB],
  ])('blocks driver assignment mismatch %s %s', async (token, load) => {
    await get('/me/loads/' + load, token).expect(404);
  });
  it.each(['accept', 'start', 'complete', 'documents/POD'])(
    'blocks legacy driver impersonation via %s',
    async (action) => {
      await post(
        `/drivers/${driverA}/loads/${loadA}/${action}`,
        'driver-b',
      ).expect(403);
    },
  );
  it.each(['accept', 'start', 'complete'])(
    'blocks me operation on another assignment: %s',
    async (action) => {
      await post(`/me/loads/${loadA}/${action}`, 'driver-b').expect(404);
    },
  );
  it('rejects driver identity supplied in JSON', async () => {
    await post(`/me/loads/${loadA}/accept`, 'driver-a', {
      driverId: driverB,
      organizationId: orgB,
    }).expect(400);
  });
  it('cannot assign a foreign organization driver', async () => {
    await post(`/loads/${loadA}/assign-driver`, 'owner-a', {
      driverId: foreignDriver,
      expectedToken: (
        (await get(`/loads/${loadA}/management`, 'owner-a')).body as {
          token: string;
        }
      ).token,
      reason: 'Foreign driver test',
      idempotencyKey: id(999),
    }).expect(404);
  });
  it('cannot fetch a foreign document', async () => {
    await get('/documents/' + documentB, 'owner-a').expect(404);
  });
  it.each(['extract-text', 'ratecon-draft'])(
    'cannot process a foreign document: %s',
    async (action) => {
      await post(`/documents/${documentB}/${action}`, 'owner-a').expect(404);
    },
  );
  it('cannot fetch a foreign agreement', async () => {
    await get('/agreements/' + agreementB, 'owner-a').expect(404);
  });
  it('cannot accept a foreign agreement', async () => {
    await post(`/agreements/${agreementB}/accept`, 'owner-a', {
      acceptedByName: 'Owner A',
    }).expect(404);
  });
  it.each(['approve', 'dismiss'])(
    'cannot %s a foreign money opportunity',
    async (action) => {
      await post(
        `/money-opportunities/${opportunityB}/${action}`,
        'owner-a',
      ).expect(404);
    },
  );
  it.each(['carrier-invoice', 'submit-billing'])(
    'cannot perform %s for a foreign load',
    async (action) => {
      await post(
        `/back-office/loads/${loadB}/${action}`,
        'owner-a',
        action === 'submit-billing' ? { recipientName: 'Test Broker' } : {},
      ).expect(404);
    },
  );
  it('cannot mark a foreign invoice paid', async () => {
    await post(
      `/back-office/accounts-receivable/loads/${loadB}/mark-paid`,
      'owner-a',
      { amountPaid: '1.00', idempotencyKey: id(902) },
    ).expect(404);
  });
  it.each(['carrier-invoice', 'submit-billing'])(
    'dispatcher cannot perform payment operation %s',
    async (action) => {
      await post(`/back-office/loads/${loadA}/${action}`, 'dispatcher').expect(
        403,
      );
    },
  );
  it('back office cannot assign drivers', async () => {
    await post(`/loads/${loadA}/assign-driver`, 'back-office', {
      driverId: driverA,
    }).expect(403);
  });
  it.each([
    [`/documents/${documentB}/ratecon-draft`, { organizationId: orgA }],
    [`/documents/${documentB}/extract-text`, { text: 'injected' }],
    [`/agreements/loads/${loadA}/rate-confirmation`, { accepted: true }],
    [`/money-opportunities/loads/${loadA}/scan`, { organizationId: orgA }],
    [`/money-opportunities/${opportunityB}/approve`, { amount: '99.00' }],
    [`/money-opportunities/${opportunityB}/dismiss`, { status: 'APPROVED' }],
    [`/back-office/loads/${loadA}/carrier-invoice`, { totalRate: '1.00' }],
    [`/drivers/${driverA}/loads/${loadA}/accept`, { userId: id(101) }],
  ])(
    'rejects unknown command fields at %s before mutation',
    async (path, body) => {
      await post(path, 'owner-a', body as Row).expect(400);
      expect(store.writes).toHaveLength(0);
    },
  );
  it.each([123, '  ', null, 'x'.repeat(201)])(
    'rejects invalid agreement signer %s',
    async (acceptedByName) => {
      await post(`/agreements/${agreementB}/accept`, 'owner-a', {
        acceptedByName,
      }).expect(400);
    },
  );
  it('rejects malformed document IDs and trimmed blank billing names with controlled errors', async () => {
    await post('/documents/not-a-uuid/extract-text', 'owner-a').expect(400);
    await post('/documents/not-a-uuid/ratecon-draft', 'owner-a').expect(400);
    await post(`/back-office/loads/${loadA}/submit-billing`, 'owner-a', {
      recipientName: '   ',
    }).expect(400);
  });
  it('preserves the driver accept/start/capture/complete flow with user audit identity', async () => {
    await post(`/me/loads/${loadA}/accept`, 'driver-a').expect(200);
    await post(`/me/loads/${loadA}/start`, 'driver-a').expect(200);
    await post(`/me/loads/${loadA}/complete`, 'driver-a').expect(400);
    for (const type of ['BOL', 'POD']) {
      await request(app.getHttpServer() as Server)
        .post(`/api/v1/me/loads/${loadA}/documents/${type}`)
        .auth('driver-a', { type: 'bearer' })
        .field('actionToken', actionToken)
        .attach('file', Buffer.from('%PDF-1.4 test evidence'), {
          filename: `${type}.pdf`,
          contentType: 'application/pdf',
        })
        .expect(201);
    }
    await post(`/me/loads/${loadA}/complete`, 'driver-a').expect(200);
    expect(store.tables.load.find((l) => l.id === loadA)?.status).toBe(
      'DELIVERED',
    );
    expect(store.tables.documentVersion).toHaveLength(2);
    expect(store.tables.loadEvent.length).toBeGreaterThanOrEqual(5);
    for (const event of store.tables.loadEvent) {
      expect(event.actorId).toBe(id(102));
      expect(event.actorName).toBe('Marcus Reed');
      expect(event.organizationId).toBe(orgA);
    }
  });

  it('preserves owner invoice, billing, payment and receivables workflows', async () => {
    const load = store.tables.load.find((row) => row.id === loadA)!;
    load.status = 'DELIVERED';
    for (const requirement of store.tables.loadRequirement) {
      if (requirement.documentType !== 'CARRIER_INVOICE')
        requirement.status = 'ACCEPTED';
    }
    await post(`/back-office/loads/${loadA}/carrier-invoice`, 'owner-a').expect(
      201,
    );
    expect(load.status).toBe('PAYMENT_READY');
    expect(store.tables.documentVersion).toHaveLength(1);
    await post(`/back-office/loads/${loadA}/submit-billing`, 'owner-a', {
      recipientName: 'Test broker',
      paymentTermsDays: 30,
    }).expect(200);
    expect(load.status).toBe('INVOICED');
    await get('/back-office/accounts-receivable', 'back-office').expect(200);
    await post(
      `/back-office/accounts-receivable/loads/${loadA}/mark-paid`,
      'back-office',
      { amountPaid: '1200.00', idempotencyKey: id(901) },
    ).expect(200);
    expect(load.status).toBe('PAID');
    const payment = store.tables.loadEvent.find(
      (row) => row.type === 'PAYMENT_RECEIVED',
    );
    expect(payment?.actorId).toBe(id(105));
    expect(payment?.organizationId).toBe(orgA);
  });

  it('keeps owner overview, money and agreement reads available', async () => {
    await get('/owner/dashboard', 'owner-a').expect(200);
    await get('/owner/loads/' + loadA, 'owner-a').expect(200);
    await get('/autopilot/loads/' + loadA, 'owner-a').expect(200);
    await get('/money-opportunities/loads/' + loadA, 'owner-a').expect(200);
    await get('/agreements/loads/' + loadA, 'owner-a').expect(200);
  });

  it('exposes driver Autopilot only for an assigned load and omits financial data', async () => {
    const response = await get(
      `/me/loads/${loadA}/autopilot`,
      'driver-a',
    ).expect(200);
    expect(response.body).toHaveProperty('driverAction');
    expect(response.body).not.toHaveProperty('moneyOpportunities');
    expect(response.body).not.toHaveProperty('ownerAction');
    await get(`/me/loads/${otherDriverLoad}/autopilot`, 'driver-a').expect(404);
  });

  it('rejects an inactive driver mapping', async () => {
    store.tables.driver.find((row) => row.id === driverA)!.status = 'INACTIVE';
    await get('/me', 'driver-a').expect(403);
  });

  it('rejects a corrupt cross-organization driver mapping', async () => {
    store.tables.driver.find((row) => row.id === driverA)!.organizationId =
      orgB;
    await get('/me', 'driver-a').expect(403);
  });
});
