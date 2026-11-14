import type { Server } from 'node:http';
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
import { DocumentStorage } from '../src/documents/document-storage';
import { database, id, loadA, loadB } from './support/database-fixture';

describe('Tenant invoice HTTP contract', () => {
  let app: INestApplication;
  let store: ReturnType<typeof database>;
  beforeEach(async () => {
    store = database();
    store.tables.load.find((row) => row.id === loadA)!.status = 'DELIVERED';
    store.tables.loadRequirement.forEach((row) => {
      if (row.documentType !== 'CARRIER_INVOICE') row.status = 'WAIVED';
    });
    const files = new Map<string, Buffer>();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(store.db)
      .overrideProvider(TokenVerifier)
      .useValue({
        verify: (token: string) => {
          if (!['owner', 'driver'].includes(token))
            throw new UnauthorizedException();
          return Promise.resolve({ sub: id(token === 'owner' ? 200 : 202) });
        },
      })
      .overrideProvider(DocumentStorage)
      .useValue({
        put: (key: string, bytes: Buffer) => {
          files.set(key, bytes);
          return Promise.resolve();
        },
        read: (key: string) => Promise.resolve(files.get(key)),
        removeUncommitted: (key: string) => {
          files.delete(key);
          return Promise.resolve();
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
  const post = (suffix: string, body: object, token = 'owner', load = loadA) =>
    request(app.getHttpServer() as Server)
      .post(`/api/v1/back-office/loads/${load}/${suffix}`)
      .auth(token, { type: 'bearer' })
      .send(body);
  it('protects invoice previews, supplemental submission and invoice-specific payment inputs', async () => {
    const get = (load = loadA, token = 'owner') =>
      request(app.getHttpServer() as Server)
        .get(`/api/v1/back-office/loads/${load}/invoices`)
        .auth(token, { type: 'bearer' });
    await get(loadA, 'driver').expect(403);
    await get(loadB).expect(404);
    await post(`invoices/${id(910)}/submit`, {}, 'driver').expect(403);
    await post(`invoices/${id(910)}/submit`, {}).expect(404);
    for (const invalid of [
      { chargeIds: [id(910), id(910)] },
      { expectedToken: 'stale' },
      { supplemental: 'true' },
      { idempotencyKey: null },
      { sender: { name: 'Forged' } },
    ])
      await post('carrier-invoice', invalid).expect(400);
    await post('carrier-invoice', { supplemental: true, chargeIds: [] }).expect(
      409,
    );
    await request(app.getHttpServer() as Server)
      .post(`/api/v1/back-office/accounts-receivable/loads/${loadA}/mark-paid`)
      .auth('owner', { type: 'bearer' })
      .send({ invoiceId: null, amountPaid: '1', idempotencyKey: id(911) })
      .expect(400);
  });
  it.each([0, 121, 365])(
    'issues and submits frozen %i-day terms',
    async (days) => {
      await post('carrier-invoice', { paymentTermsDays: days }).expect(201);
      await post('submit-billing', {
        recipientName: 'Synthetic broker',
        paymentTermsDays: days === 0 ? 30 : 0,
      }).expect(409);
      await post('submit-billing', {
        recipientName: 'Synthetic broker',
        paymentTermsDays: days,
      }).expect(200);
      expect(
        store.tables.load.find((row) => row.id === loadA)?.paymentTermsDays,
      ).toBe(days);
    },
  );
  it.each([-1, 366, 1.5, null, '30'])(
    'rejects invalid terms %s at both mutation boundaries',
    async (days) => {
      await post('carrier-invoice', { paymentTermsDays: days }).expect(400);
      await post('submit-billing', {
        recipientName: 'Synthetic broker',
        paymentTermsDays: days,
      }).expect(400);
      expect(store.tables.documentVersion).toHaveLength(0);
    },
  );
  it('rejects arbitrary sender fields, unauthorized roles and foreign loads', async () => {
    await post('carrier-invoice', {
      organizationId: id(2),
      sender: { name: 'Injected' },
    }).expect(400);
    await post('carrier-invoice', {}, 'driver').expect(403);
    await post('carrier-invoice', {}, 'owner', loadB).expect(404);
    expect(store.tables.documentVersion).toHaveLength(0);
  });
  it('uses saved company terms when the request is empty and exposes effective/frozen terms', async () => {
    store.tables.organization[0].defaultPaymentTermsDays = 45;
    await post('carrier-invoice', {}).expect(201);
    const result = await request(app.getHttpServer() as Server)
      .get(`/api/v1/back-office/loads/${loadA}/readiness`)
      .auth('owner', { type: 'bearer' })
      .expect(200);
    expect(result.body).toMatchObject({
      load: {
        paymentTermsDays: 45,
        effectivePaymentTermsDays: 45,
      },
    });
    expect(
      typeof (result.body as { load: { paymentDueAt: unknown } }).load
        .paymentDueAt,
    ).toBe('string');
  });
});
