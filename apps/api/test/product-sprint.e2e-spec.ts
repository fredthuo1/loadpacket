import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import {
  UnauthorizedException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import { createHash } from 'node:crypto';
jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));
jest.mock('pdf-parse/worker', () => ({ CanvasFactory: class {} }));
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TokenVerifier } from '../src/auth/token-verifier';
import { DocumentStorage } from '../src/documents/document-storage';
import { database, id, loadA, loadB, orgA } from './support/database-fixture';
describe('Days 11–12 financial review and external sharing', () => {
  let app: INestApplication;
  let store: ReturnType<typeof database>;
  beforeEach(async () => {
    store = database();
    store.tables.loadStop.push(
      ...['PICKUP', 'DELIVERY'].map((type, i) => ({
        id: id(830 + i),
        organizationId: orgA,
        loadId: loadA,
        type,
        sequence: i + 1,
        address: 'Shared address',
        facilityName: 'Facility',
        appointmentText: null,
        arrivedAt: new Date('2026-09-23T00:00:00Z'),
        departedAt: new Date('2026-09-23T03:10:00Z'),
      })),
    );
    store.tables.document.push({
      id: id(840),
      organizationId: orgA,
      type: 'BOL',
    });
    store.tables.documentVersion.push({
      id: id(841),
      organizationId: orgA,
      documentId: id(840),
      versionNumber: 1,
      storageKey: 'private-test',
      mimeType: 'application/pdf',
      originalFileName: 'private-driver-name.pdf',
    });
    store.tables.loadDocument.push({
      id: id(842),
      organizationId: orgA,
      loadId: loadA,
      documentId: id(840),
      role: 'BOL',
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(store.db)
      .overrideProvider(TokenVerifier)
      .useValue({
        verify: (token: string) => {
          const roles = [
            'owner',
            'foreign',
            'driver',
            'other-driver',
            'dispatcher',
            'back-office',
          ];
          const i = roles.indexOf(token);
          if (i < 0) throw new UnauthorizedException();
          return Promise.resolve({ sub: id(200 + i) });
        },
      })
      .overrideProvider(DocumentStorage)
      .useValue({ read: () => Promise.resolve(Buffer.from('%PDF-test')) })
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
    method: 'get' | 'post' | 'patch',
    path: string,
    token = 'owner',
  ) =>
    request(app.getHttpServer() as Server)
      [method](`/api/v1${path}`)
      .auth(token, { type: 'bearer' });
  const scan = (token = 'owner', load = loadA) =>
    api('post', `/money-opportunities/loads/${load}/scan`, token).send({});
  const create = (
    permissions = [
      'VIEW_LOAD_SUMMARY',
      'VIEW_ROUTE',
      'VIEW_DOCUMENT_STATUS',
      'VIEW_SHARED_DOCUMENTS',
      'VIEW_DELIVERY_STATUS',
    ],
    token = 'owner',
    load = loadA,
  ) =>
    api('post', `/loads/${load}/broker-access`, token).send({
      permissions,
      documentTypes: ['BOL'],
      expiresInDays: 7,
    });
  const view = (token: string) =>
    request(app.getHttpServer() as Server)
      .get('/api/v1/external/transactions')
      .set('X-Broker-Token', token);
  const download = (token: string, handle: string) =>
    request(app.getHttpServer() as Server)
      .post('/api/v1/external/transactions/download')
      .set('X-Broker-Token', token)
      .send({ handle });
  const tokenOf = (body: unknown) =>
    (body as { path: string }).path.split('#')[1];
  it('detects pickup/delivery candidates once, requires review, enforces roles/tenants and audits amounts', async () => {
    const first = await scan().expect(201);
    expect(first.body).toMatchObject({ createdCount: 2 });
    await scan()
      .expect(201)
      .expect(({ body }: { body: { createdCount: number } }) =>
        expect(body.createdCount).toBe(0),
      );
    const opportunity = store.tables.loadChargeOpportunity.find(
      (row) => row.type === 'DETENTION',
    )!;
    expect(opportunity.amount).toBeNull();
    expect(opportunity.evidence).toMatchObject({
      totalWaitMinutes: 190,
      freeMinutes: null,
    });
    await api('post', `/money-opportunities/${String(opportunity.id)}/approve`)
      .send({})
      .expect(400);
    await api(
      'patch',
      `/money-opportunities/${String(opportunity.id)}/amount`,
      'driver',
    )
      .send({ amount: '175.00' })
      .expect(403);
    await api(
      'patch',
      `/money-opportunities/${String(opportunity.id)}/amount`,
      'back-office',
    )
      .send({ amount: '175.00' })
      .expect(200);
    await api(
      'post',
      `/money-opportunities/${String(opportunity.id)}/approve`,
      'dispatcher',
    )
      .send({})
      .expect(403);
    await api(
      'post',
      `/money-opportunities/${String(opportunity.id)}/approve`,
      'back-office',
    )
      .send({})
      .expect(201);
    await api('patch', `/money-opportunities/${String(opportunity.id)}/amount`)
      .send({ amount: '200.00' })
      .expect(400);
    expect(JSON.stringify(store.tables.loadEvent)).toContain('AMOUNT_REVIEWED');
    await scan('owner', loadB).expect(404);
  });
  it('stores immutable reviewed terms, calculates estimate, flags existing invoice and never changes totals', async () => {
    const body = {
      freeMinutes: 120,
      hourlyRate: '150.00',
      basis: 'Reviewed signed rate confirmation',
    };
    await api('post', `/money-opportunities/loads/${loadA}/detention-terms`)
      .send(body)
      .expect(201);
    await api('post', `/money-opportunities/loads/${loadA}/detention-terms`)
      .send(body)
      .expect(201);
    expect(store.tables.agreementVersion).toHaveLength(1);
    store.tables.load[0].invoiceIssuedAt = new Date();
    await scan().expect(201);
    const opportunities = store.tables.loadChargeOpportunity.filter(
      (row) => row.type === 'DETENTION',
    );
    expect(opportunities).toHaveLength(2);
    expect(opportunities[0]).toMatchObject({
      amount: '175.00',
      evidence: { billingFollowUpRequired: true },
    });
    expect(store.tables.load[0].totalRate).toBe('1200.00');
    await api('post', `/money-opportunities/loads/${loadA}/detention-terms`)
      .send({ ...body, hourlyRate: '-1', organizationId: orgA })
      .expect(400);
    await api(
      'post',
      `/money-opportunities/loads/${loadA}/detention-terms`,
      'driver',
    )
      .send(body)
      .expect(403);
  });
  it('stores only hash, returns sanitized projection and grants short-lived scoped document download', async () => {
    const created = await create().expect(201);
    const token = tokenOf(created.body);
    expect(store.tables.externalTransactionAccess[0].tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(JSON.stringify(store.tables)).not.toContain(token);
    const result = await view(token).expect(200);
    const body = result.body as { documents: { handle: string }[] };
    expect(result.headers['cache-control']).toContain('no-store');
    expect(JSON.stringify(body)).not.toMatch(
      /organizationId|loadId|driverId|brokerName|totalRate|storageKey|private-driver-name|actorId|metadata/,
    );
    expect(
      store.tables.externalTransactionAccess[0].lastAccessedAt,
    ).toBeInstanceOf(Date);
    await download(token, body.documents[0].handle)
      .expect(200)
      .expect('Content-Type', /application\/pdf/);
    const accessId = String(store.tables.externalTransactionAccess[0].id);
    await api('post', `/loads/${loadA}/broker-access/${accessId}/revoke`)
      .send({})
      .expect(200);
    await download(token, body.documents[0].handle).expect(404);
    await view(token).expect(404);
  });
  it('permissions default deny; cross-load grants and regenerated/expired/unknown links fail uniformly', async () => {
    const first = await create().expect(201);
    const oldToken = tokenOf(first.body);
    const result = await view(oldToken).expect(200);
    const handle = (result.body as { documents: { handle: string }[] })
      .documents[0].handle;
    const second = await create(['VIEW_LOAD_SUMMARY']).expect(201);
    const token = tokenOf(second.body);
    await view(oldToken).expect(404);
    const restricted = await view(token).expect(200);
    expect(restricted.body).toMatchObject({
      route: [],
      documents: [],
      documentStatus: [],
      timeline: [],
    });
    await download(token, handle).expect(404);
    store.tables.externalTransactionAccess[1].expiresAt = new Date(0);
    await view(token).expect(404);
    await view('A'.repeat(43)).expect(404);
    await view('bad').expect(404);
    await create([], 'owner', loadB).expect(404);
    await create([], 'driver').expect(403);
    await create([], 'dispatcher').expect(403);
  });
  it('rejects extra identity fields, unsafe expiry and unknown permissions', async () => {
    for (const body of [
      { permissions: ['EVERYTHING'] },
      { permissions: [], expiresInDays: 999 },
      { permissions: [], organizationId: orgA },
    ])
      await api('post', `/loads/${loadA}/broker-access`).send(body).expect(400);
    await api('get', `/loads/${loadA}/broker-access`, 'foreign').expect(404);
  });
  it('rejects expired and foreign-load document grants and excludes vault evidence', async () => {
    const token = tokenOf((await create().expect(201)).body);
    const result = await view(token).expect(200);
    const handle = (result.body as { documents: { handle: string }[] })
      .documents[0].handle;
    const foreignToken = tokenOf(
      (await create(['VIEW_SHARED_DOCUMENTS'], 'foreign', loadB).expect(201))
        .body,
    );
    await download(foreignToken, handle).expect(404);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61000);
    try {
      await download(token, handle).expect(404);
    } finally {
      clock.mockRestore();
    }
    store.tables.driverDocument.push({
      id: id(850),
      organizationId: orgA,
      documentId: id(840),
      driverId: id(20),
    });
    const restricted = await view(token).expect(200);
    expect((restricted.body as { documents: unknown[] }).documents).toEqual([]);
    await download(token, handle).expect(404);
  });
});
