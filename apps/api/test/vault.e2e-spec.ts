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
import { DocumentStorage } from '../src/documents/document-storage';
import {
  database,
  id,
  driverA,
  driverB,
  foreignDriver,
} from './support/database-fixture';
import type { VaultDocument } from '../../../packages/api-contracts/vault';

describe('Business document vault HTTP boundaries', () => {
  let app: INestApplication;
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
  const pdf = Buffer.from('%PDF-1.7\noriginal evidence');
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
          if (files.has(key)) throw new Error('Cannot overwrite');
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
    jest.restoreAllMocks();
    await app.close();
  });
  const api = (method: 'get' | 'post', path: string, token = 'owner-a') =>
    request(app.getHttpServer() as Server)
      [method](`/api/v1${path}`)
      .auth(token, { type: 'bearer' });
  const upload = (
    path = '/company/documents',
    token = 'owner-a',
    key = randomUUID(),
    bytes = pdf,
    type = 'W9',
  ) =>
    api('post', path, token)
      .field('uploadKey', key)
      .field('type', type)
      .attach('file', bytes, {
        filename: 'evidence.pdf',
        contentType: 'application/pdf',
      });
  const create = async (driver?: string) =>
    (
      await upload(
        driver ? `/drivers/${driver}/documents` : undefined,
        'owner-a',
        randomUUID(),
        pdf,
        driver ? 'CDL' : 'W9',
      ).expect(201)
    ).body as VaultDocument;
  const grant = async (
    doc: VaultDocument,
    token = 'owner-a',
    version = doc.versions[0],
  ) =>
    (
      await api(
        'post',
        `/documents/vault/${doc.id}/versions/${version.id}/download`,
        token,
      )
        .send({})
        .expect(200)
    ).body as { path: string };
  const fetchGrant = (path: string) =>
    request(app.getHttpServer() as Server).get(`/api/v1${path}`);

  it('preserves immutable evidence and deduplicates identical retries, with conflicting keys rejected', async () => {
    const key = randomUUID();
    const first = (await upload(undefined, undefined, key).expect(201))
      .body as VaultDocument;
    expect(first).toMatchObject({
      context: 'COMPANY',
      type: 'W9',
      ownerName: 'Carrier A',
    });
    expect(first.versions[0]).toMatchObject({
      versionNumber: 1,
      uploadedBy: 'Test User',
      sizeBytes: pdf.length,
    });
    expect(first.versions[0].checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(first)).not.toMatch(
      /storageKey|uploadKey|authUserId/,
    );
    const retry = (await upload(undefined, undefined, key).expect(201))
      .body as VaultDocument;
    expect(retry.id).toBe(first.id);
    expect(files.size).toBe(1);
    await upload(
      undefined,
      undefined,
      key,
      Buffer.from('%PDF-1.7\nchanged'),
    ).expect(409);
    const updated = (
      await api('post', `/documents/vault/${first.id}/versions`)
        .field('uploadKey', randomUUID())
        .field('expiresAt', '2027-01-01')
        .attach('file', Buffer.from('%PDF-1.7\ncorrected'), {
          filename: 'corrected.pdf',
          contentType: 'application/pdf',
        })
        .expect(201)
    ).body as VaultDocument;
    expect(updated.versions.map((v) => v.versionNumber)).toEqual([2, 1]);
    expect(updated.versions[1]).toEqual(first.versions[0]);
    expect(files.size).toBe(2);
    const link = await grant(updated, 'owner-a', updated.versions[1]);
    const response = await fetchGrant(link.path).expect(200);
    expect(response.body).toEqual(pdf);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['content-disposition']).toContain('attachment;');
  });
  it.each(['dispatcher', 'back-office'])(
    '%s can read company records but cannot upload or inspect driver evidence',
    async (token) => {
      const company = await create();
      const driver = await create(driverA);
      await api('get', '/company/documents', token).expect(200);
      const link = await grant(company, token);
      await fetchGrant(link.path).expect(200);
      await upload(undefined, token).expect(403);
      await api('get', `/documents/vault/${driver.id}`, token).expect(404);
      await api('get', `/documents/${driver.id}`, token).expect(404);
      await api(
        'post',
        `/documents/vault/${driver.id}/versions/${driver.versions[0].id}/download`,
        token,
      )
        .send({})
        .expect(404);
      const list = (await api('get', '/documents/vault', token).expect(200))
        .body as VaultDocument[];
      expect(list.map((d) => d.id)).toEqual([company.id]);
    },
  );
  it('drivers see only their own sensitive documents; tenant and legacy routes cannot bypass scope', async () => {
    const own = await create(driverA);
    const other = await create(driverB);
    const company = await create();
    const list = (await api('get', '/documents/vault', 'driver-a').expect(200))
      .body as VaultDocument[];
    expect(list.map((d) => d.id)).toEqual([own.id]);
    await api('get', `/drivers/${driverA}/documents`, 'driver-a').expect(200);
    await api('get', `/drivers/${driverB}/documents`, 'driver-a').expect(404);
    for (const doc of [other, company])
      await api('get', `/documents/vault/${doc.id}`, 'driver-a').expect(404);
    await api('get', `/documents/vault/${own.id}`, 'owner-b').expect(404);
    await api('get', `/documents/${own.id}`, 'driver-a').expect(403);
    await upload(
      `/drivers/${foreignDriver}/documents`,
      'owner-a',
      randomUUID(),
      pdf,
      'CDL',
    ).expect(404);
    expect(files.size).toBe(3);
    const link = await grant(own, 'driver-a');
    await fetchGrant(link.path).expect(200);
    store.tables.driver[0].status = 'INACTIVE';
    await fetchGrant(link.path).expect(403);
  });
  it('rejects anonymous access, malformed IDs, dates, unknown fields and invalid file content without writes', async () => {
    await request(app.getHttpServer() as Server)
      .get('/api/v1/documents/vault')
      .expect(401);
    await api('get', '/documents/vault/not-a-uuid').expect(400);
    await upload().field('organizationId', id(2)).expect(400);
    await upload().field('issuedAt', '2026-02-30').expect(400);
    await upload()
      .field('issuedAt', '2027-01-01')
      .field('expiresAt', '2026-01-01')
      .expect(400);
    await upload(
      undefined,
      undefined,
      randomUUID(),
      Buffer.from('not a PDF'),
    ).expect(400);
    await api('post', '/company/documents')
      .field('uploadKey', randomUUID())
      .field('type', 'W9')
      .expect(400);
    await upload(
      undefined,
      undefined,
      randomUUID(),
      Buffer.alloc(10 * 1024 * 1024 + 1),
    ).expect(413);
    expect(files.size).toBe(0);
    expect(store.tables.organizationDocument).toHaveLength(0);
  });
  it('grants expire, reject tampering and recheck current account and role', async () => {
    const doc = await create();
    const link = await grant(doc);
    await fetchGrant(link.path + 'x').expect(403);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61000);
    await fetchGrant(link.path).expect(403);
    clock.mockRestore();
    store.tables.user[0].active = false;
    await fetchGrant(link.path).expect(403);
    store.tables.user[0].active = true;
    store.tables.user[0].role = 'DRIVER';
    await fetchGrant(link.path).expect(403);
  });
  it('filters expiration independently from upload lifecycle', async () => {
    const expired = (
      await upload().field('expiresAt', '2020-01-01').expect(201)
    ).body as VaultDocument;
    expect(expired).toMatchObject({
      expiration: 'EXPIRED',
      status: 'UPLOADED',
    });
    await create();
    const list = (
      await api(
        'get',
        '/documents/vault?expiration=EXPIRED&search=evidence&type=W9',
      ).expect(200)
    ).body as VaultDocument[];
    expect(list.map((d) => d.id)).toEqual([expired.id]);
  });
  it('scopes operations counts and redacts sensitive driver compliance and finance for dispatchers', async () => {
    await upload().field('expiresAt', '2020-01-01').expect(201);
    await upload(
      `/drivers/${driverA}/documents`,
      'owner-a',
      randomUUID(),
      pdf,
      'CDL',
    )
      .field('expiresAt', '2020-01-01')
      .expect(201);
    store.tables.driver[1].status = 'INACTIVE';
    store.tables.driverInvitation.push({
      id: id(900),
      organizationId: id(1),
      driverId: driverA,
      status: 'PENDING',
    });
    store.tables.loadRequirement[0].status = 'RECEIVED';
    Object.assign(store.tables.load[2], {
      status: 'INVOICED',
      amountPaid: '200.10',
      totalRate: '1200.20',
      paymentDueAt: new Date('2020-01-01'),
    });
    const owner = await api('get', '/owner/dashboard').expect(200);
    expect((owner.body as { operations: unknown }).operations).toMatchObject({
      drivers: { active: 1, inactive: 1, invitePending: 1 },
      attention: {
        awaitingReview: 1,
        blockedLoads: 1,
        expiredDocuments: 2,
        driverComplianceIssues: 1,
      },
      receivables: {
        partialCount: 1,
        overdueCount: 1,
        overdueAmount: '1000.10',
      },
      moneyFound: { count: 0, amount: '0.00' },
    });
    const dispatcher = await api(
      'get',
      '/owner/dashboard',
      'dispatcher',
    ).expect(200);
    expect(
      (dispatcher.body as { operations: unknown }).operations,
    ).toMatchObject({
      attention: { expiredDocuments: 1, driverComplianceIssues: null },
      receivables: null,
      moneyFound: null,
    });
    const foreign = await api('get', '/owner/dashboard', 'owner-b').expect(200);
    expect((foreign.body as { operations: unknown }).operations).toMatchObject({
      drivers: { active: 1, inactive: 0, invitePending: 0 },
      attention: { expiredDocuments: 0, awaitingReview: 0 },
      receivables: { partialCount: 0, overdueAmount: '0.00' },
      moneyFound: { count: 1, amount: '100.00' },
    });
  });
});
