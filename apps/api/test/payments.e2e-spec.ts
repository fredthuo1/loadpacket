import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import {
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
import { database, id, loadA } from './support/database-fixture';
describe('Partial payment ledger HTTP boundaries', () => {
  let app: INestApplication;
  let store: ReturnType<typeof database>;
  const tokens = [
    'owner-a',
    'owner-b',
    'driver-a',
    'driver-b',
    'dispatcher',
    'back-office',
  ];
  const paymentPath = `/api/v1/back-office/accounts-receivable/loads/${loadA}/mark-paid`;
  beforeEach(async () => {
    store = database();
    Object.assign(store.tables.load[0], {
      status: 'INVOICED',
      totalRate: '3250.00',
      invoiceNumber: 'TEST-INV',
      invoiceIssuedAt: new Date(),
      paymentDueAt: new Date('2020-01-01'),
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(store.db)
      .overrideProvider(TokenVerifier)
      .useValue({
        verify: (token: string) => {
          const index = tokens.indexOf(token);
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
  const pay = (body: object, token = 'owner-a') =>
    request(app.getHttpServer() as Server)
      .post(paymentPath)
      .auth(token, { type: 'bearer' })
      .send(body);
  const dashboard = () =>
    request(app.getHttpServer() as Server)
      .get('/api/v1/back-office/accounts-receivable')
      .auth('back-office', { type: 'bearer' });
  it('records partial and final payments exactly once with correct outstanding A/R', async () => {
    const first = { amountPaid: '1000.00', idempotencyKey: randomUUID() };
    await pay(first).expect(200);
    await pay(first).expect(200);
    expect(store.tables.load[0]).toMatchObject({
      status: 'INVOICED',
      amountPaid: '1000.00',
      paidAt: null,
    });
    expect(store.tables.loadPayment).toHaveLength(1);
    const ar = await dashboard().expect(200);
    expect(ar.body).toMatchObject({
      summary: {
        outstanding: { amount: '2250.00', count: 1 },
        overdue: { amount: '2250.00', count: 1 },
      },
      invoices: [{ amountPaid: '1000.00', remainingBalance: '2250.00' }],
    });
    await pay({ ...first, amountPaid: '1500.00' }).expect(409);
    await pay({ amountPaid: '2250.01', idempotencyKey: randomUUID() }).expect(
      400,
    );
    const final = { amountPaid: '2250.00', idempotencyKey: randomUUID() };
    await pay(final, 'back-office').expect(200);
    await pay(final, 'back-office').expect(200);
    expect(store.tables.load[0]).toMatchObject({
      status: 'PAID',
      amountPaid: '3250.00',
    });
    expect(store.tables.loadPayment).toHaveLength(2);
    expect(store.tables.load[0].paidAt).toBeInstanceOf(Date);
    expect(store.tables.loadEvent).toHaveLength(2);
    expect(store.tables.loadEvent[1].metadata).toMatchObject({
      paymentAmount: '2250.00',
      cumulativeAmountPaid: '3250.00',
      remainingBalance: '0.00',
    });
    await pay({ amountPaid: '1.00', idempotencyKey: randomUUID() }).expect(409);
    expect((await dashboard().expect(200)).body).toMatchObject({
      summary: { outstanding: { amount: '0.00', count: 0 } },
    });
  });
  it.each(['0', '-1', '1.001', 'NaN', '10000000000', 42])(
    'rejects invalid amount %s without financial writes',
    async (amountPaid) => {
      await pay({ amountPaid, idempotencyKey: randomUUID() }).expect(400);
      expect(store.tables.loadPayment).toHaveLength(0);
      expect(store.tables.loadEvent).toHaveLength(0);
    },
  );
  it('requires an operation key and rejects foreign identity fields', async () => {
    await pay({ amountPaid: '1.00' }).expect(400);
    await pay({
      amountPaid: '1.00',
      idempotencyKey: randomUUID(),
      organizationId: id(2),
    }).expect(400);
  });
  it.each(['driver-a', 'dispatcher'])(
    '%s cannot record payments',
    async (token) => {
      await pay(
        { amountPaid: '1.00', idempotencyKey: randomUUID() },
        token,
      ).expect(403);
    },
  );
  it('rejects foreign and anonymous requests', async () => {
    await pay(
      { amountPaid: '1.00', idempotencyKey: randomUUID() },
      'owner-b',
    ).expect(404);
    await request(app.getHttpServer() as Server)
      .post(paymentPath)
      .send({ amountPaid: '1.00', idempotencyKey: randomUUID() })
      .expect(401);
  });
  it('does not silently overwrite a preexisting balance that disagrees with the ledger', async () => {
    store.tables.load[0].amountPaid = '100.00';
    await pay({ amountPaid: '1.00', idempotencyKey: randomUUID() }).expect(409);
    expect(store.tables.load[0].amountPaid).toBe('100.00');
    expect(store.tables.loadPayment).toHaveLength(0);
  });
});
