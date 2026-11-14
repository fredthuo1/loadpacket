import { driverActionToken } from '../src/loads/load-action-token';
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
describe('Document review and immutable driver corrections', () => {
  let app: INestApplication;
  let actionToken: string;
  let store: ReturnType<typeof database>;
  let files: Map<string, Buffer>;
  const tokens = [
    'owner-a',
    'owner-b',
    'driver-a',
    'driver-b',
    'dispatcher',
    'back-office',
  ];
  const base = `/back-office/loads/${loadA}/requirements`;
  beforeEach(async () => {
    store = database();
    files = new Map();
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
    actionToken = await driverActionToken(
      app.get(PrismaService),
      id(1),
      loadA,
      id(20),
    );
  });
  afterEach(async () => {
    await app.close();
  });
  const api = (method: 'get' | 'post', path: string, token = 'owner-a') =>
    request(app.getHttpServer() as Server)
      [method](`/api/v1${path}`)
      .auth(token, { type: 'bearer' });
  const capture = (type = 'BOL', token = 'driver-a', content = 'original') =>
    api('post', `/me/loads/${loadA}/documents/${type}`, token)
      .field('actionToken', actionToken)
      .attach('file', Buffer.from('%PDF-1.7 ' + content), {
        filename: `${type}.pdf`,
        contentType: 'application/pdf',
      });
  async function start() {
    await api('post', `/me/loads/${loadA}/accept`, 'driver-a')
      .send({ actionToken })
      .expect(200);
    await api('post', `/me/loads/${loadA}/start`, 'driver-a')
      .send({ actionToken })
      .expect(200);
  }
  it('rejects then preserves original evidence on post-delivery correction; stale approval fails and approval retry emits one event', async () => {
    await start();
    await capture().expect(201);
    await capture('POD').expect(201);
    await api('post', `/me/loads/${loadA}/complete`, 'driver-a')
      .send({ actionToken })
      .expect(200);
    const old = store.tables.documentVersion[0];
    await api('post', `${base}/${id(70)}/reject`, 'back-office')
      .send({ versionId: old.id, reason: ' unreadable signature ' })
      .expect(200);
    await api('post', `${base}/${id(70)}/reject`, 'back-office')
      .send({ versionId: old.id, reason: 'unreadable signature' })
      .expect(200);
    expect(
      store.tables.loadEvent.filter((e) => e.type === 'DOCUMENT_REJECTED'),
    ).toHaveLength(1);
    const packet = await api('get', `/me/loads/${loadA}`, 'driver-a').expect(
      200,
    );
    expect(JSON.stringify(packet.body)).toContain('unreadable signature');
    await capture('BOL', 'driver-a', 'corrected signature').expect(201);
    const revised = store.tables.documentVersion[2];
    expect(revised.documentId).toBe(old.documentId);
    expect(revised.versionNumber).toBe(2);
    expect(files.get(String(old.storageKey))?.toString()).toContain('original');
    expect(store.tables.loadRequirement[0]).toMatchObject({
      status: 'RECEIVED',
      reviewReason: null,
      reviewedVersionId: null,
    });
    await api('post', `${base}/${id(70)}/accept`)
      .send({ versionId: old.id })
      .expect(409);
    await api('post', `${base}/${id(70)}/accept`)
      .send({ versionId: revised.id })
      .expect(200);
    await api('post', `${base}/${id(70)}/accept`)
      .send({ versionId: revised.id })
      .expect(200);
    expect(
      store.tables.loadEvent.filter((e) => e.type === 'DOCUMENT_VALIDATED'),
    ).toHaveLength(1);
    expect(store.tables.loadRequirement[0]).toMatchObject({
      status: 'ACCEPTED',
      reviewedVersionId: revised.id,
      reviewedByUserId: id(100),
    });
    await capture('BOL', 'driver-a', 'overwrite approved').expect(409);
  });
  it('waives missing evidence with an audit reason and no duplicate retry event', async () => {
    await api('post', `${base}/${id(70)}/waive`)
      .send({ reason: 'Not required by customer' })
      .expect(200);
    await api('post', `${base}/${id(70)}/waive`)
      .send({ reason: 'Not required by customer' })
      .expect(200);
    expect(
      store.tables.loadEvent.filter((e) => e.type === 'DOCUMENT_WAIVED'),
    ).toHaveLength(1);
    expect(store.tables.loadRequirement[0]).toMatchObject({
      status: 'WAIVED',
      reviewedVersionId: null,
      reviewReason: 'Not required by customer',
    });
  });
  it.each(['driver-a', 'driver-b', 'dispatcher'])(
    '%s cannot review paperwork',
    async (token) => {
      await api('get', base, token).expect(403);
      await api('post', `${base}/${id(70)}/waive`, token)
        .send({ reason: 'bypass' })
        .expect(403);
      expect(store.tables.loadEvent).toHaveLength(0);
    },
  );
  it('foreign, mismatched and malformed resources and invalid DTOs fail without changes', async () => {
    await api('get', base, 'owner-b').expect(404);
    await api(
      'post',
      `/back-office/loads/${loadB}/requirements/${id(70)}/waive`,
      'owner-b',
    )
      .send({ reason: 'wrong load' })
      .expect(404);
    for (const body of [
      { reason: 123 },
      { reason: ' ' },
      { reason: 'x', organizationId: id(2) },
      { reason: 'x'.repeat(1001) },
    ])
      await api('post', `${base}/${id(70)}/waive`)
        .send(body)
        .expect(400);
    await api('post', `${base}/${id(70)}/accept`)
      .send({ versionId: 'invalid' })
      .expect(400);
    expect(store.tables.loadEvent).toHaveLength(0);
  });
  it('keeps received and rejected paperwork out of billing until canonical review passes', async () => {
    await start();
    await capture().expect(201);
    await capture('POD').expect(201);
    await api('post', `/me/loads/${loadA}/complete`, 'driver-a')
      .send({ actionToken })
      .expect(200);
    await api('post', `/back-office/loads/${loadA}/carrier-invoice`)
      .send({})
      .expect(201);
    expect(store.tables.load[0].status).toBe('DELIVERED');
    const readiness = await api(
      'get',
      `/back-office/loads/${loadA}/readiness`,
    ).expect(200);
    expect(JSON.stringify(readiness.body)).toContain('Needs review');
    const owner = await api('get', `/owner/loads/${loadA}`).expect(200);
    expect(JSON.stringify(owner.body)).toContain('"ready":false');
    const auto = await api('get', `/autopilot/loads/${loadA}`).expect(200);
    expect(JSON.stringify(auto.body)).toContain('RESOLVE_DOCUMENT_BLOCKERS');
    await api('post', `/back-office/loads/${loadA}/submit-billing`)
      .send({ recipientName: 'Test broker', paymentTermsDays: 30 })
      .expect(400);
    const bol = store.tables.documentVersion[0];
    const pod = store.tables.documentVersion[1];
    await api('post', `${base}/${id(70)}/accept`)
      .send({ versionId: bol.id })
      .expect(200);
    await api('post', `${base}/${id(71)}/reject`)
      .send({ versionId: pod.id, reason: 'Unreadable' })
      .expect(200);
    expect(store.tables.load[0].status).toBe('DELIVERED');
    await api('post', `${base}/${id(71)}/waive`)
      .send({
        versionId: pod.id,
        reason: 'Broker confirmed delivery separately',
      })
      .expect(200);
    expect(store.tables.load[0].status).toBe('PAYMENT_READY');
    await api('post', `${base}/${id(71)}/waive`)
      .send({
        versionId: pod.id,
        reason: 'Broker confirmed delivery separately',
      })
      .expect(200);
    await api('post', `/back-office/loads/${loadA}/carrier-invoice`)
      .send({})
      .expect(201);
    expect(
      store.tables.loadEvent.filter((event) => event.type === 'PAYMENT_READY'),
    ).toHaveLength(1);
    const invoiceRequirement = store.tables.loadRequirement.find(
      (row) => row.documentType === 'CARRIER_INVOICE',
    );
    expect(invoiceRequirement).toMatchObject({
      status: 'ACCEPTED',
      reviewReason: 'System-generated immutable carrier invoice',
    });
    await api('post', `/back-office/loads/${loadA}/submit-billing`)
      .send({ recipientName: 'Test broker', paymentTermsDays: 30 })
      .expect(200);
    expect(store.tables.load[0].status).toBe('INVOICED');
  });
  it('does not approve missing evidence or mutate already billed paperwork', async () => {
    await api('post', `${base}/${id(70)}/accept`)
      .send({ versionId: id(99) })
      .expect(409);
    store.tables.load[0].status = 'INVOICED';
    await api('post', `${base}/${id(70)}/waive`)
      .send({ reason: 'too late' })
      .expect(409);
    expect(store.tables.loadEvent).toHaveLength(0);
  });
});
