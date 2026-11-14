import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import {
  UnauthorizedException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import { PNG } from 'pngjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TokenVerifier } from '../src/auth/token-verifier';
import {
  DocumentStorage,
  LocalDocumentStorage,
} from '../src/documents/document-storage';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import type { UserRole } from '../src/generated/prisma/client';

async function main() {
  const target = new URL(process.env.DATABASE_URL!);
  assert.equal(target.hostname, '127.0.0.1');
  assert.equal(target.port, '55439');
  assert.equal(target.pathname, '/loadpacket_finance_verified_test');
  const db = new PrismaService(),
    org = randomUUID(),
    other = randomUUID();
  const tokens = new Map<string, string>();
  const testRoot = resolve('test-results');
  await mkdir(testRoot, { recursive: true });
  const root = await mkdtemp(resolve(testRoot, 'signature-'));
  const originalStorage = process.env.DOCUMENT_STORAGE_ROOT;
  process.env.DOCUMENT_STORAGE_ROOT = root;
  const store = new LocalDocumentStorage();
  let storageFailure = false;
  const storage: DocumentStorage = {
    put: async (key, bytes) => {
      if (storageFailure) throw new Error('private-path-do-not-expose');
      await store.put(key, bytes);
    },
    read: (key) => store.read(key),
    removeUncommitted: (key) => store.removeUncommitted(key),
  };
  let app: INestApplication | undefined,
    checks = 0;
  const check = (name: string) => {
    checks++;
    console.log('PASS ' + name);
  };
  try {
    await db.$connect();
    await store.onModuleInit();
    await db.organization.createMany({
      data: [
        { id: org, name: 'Fictional Signature A' },
        { id: other, name: 'Fictional Signature B' },
      ],
    });
    for (const [token, role, organizationId] of [
      ['driver', 'DRIVER', org],
      ['unrelated', 'DRIVER', org],
      ['owner', 'OWNER', org],
      ['office', 'BACK_OFFICE', org],
      ['dispatch', 'DISPATCHER', org],
      ['foreign', 'OWNER', other],
    ] as [string, UserRole, string][]) {
      const user = await db.user.create({
        data: {
          organizationId,
          role,
          authUserId: randomUUID(),
          firstName: 'Fictional',
          lastName: token,
          email: `${token}@example.invalid`,
        },
      });
      tokens.set(token, user.authUserId);
      if (role === 'DRIVER')
        await db.driver.create({
          data: {
            organizationId,
            userId: user.id,
            firstName: 'Fictional',
            lastName: token,
          },
        });
    }
    const driver = await db.driver.findFirstOrThrow({
      where: { organizationId: org, lastName: 'driver' },
    });
    const load = await db.load.create({
      data: {
        organizationId: org,
        loadNumber: 'SIGN-DEMO',
        brokerName: 'Fictional',
        status: 'IN_TRANSIT',
        totalRate: '1000.00',
      },
    });
    await db.loadAssignment.create({
      data: {
        organizationId: org,
        driverId: driver.id,
        loadId: load.id,
        status: 'IN_PROGRESS',
      },
    });
    for (const documentType of ['BOL', 'POD'] as const)
      await db.loadRequirement.create({
        data: {
          organizationId: org,
          loadId: load.id,
          documentType,
          requirement: 'REQUIRED',
        },
      });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(DocumentStorage)
      .useValue(storage)
      .overrideProvider(TokenVerifier)
      .useValue({
        verify: (token: string) => {
          const sub = tokens.get(token);
          if (!sub) throw new UnauthorizedException();
          return Promise.resolve({ sub });
        },
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new PrismaExceptionFilter());
    await app.init();
    const server = app.getHttpServer() as Server;
    const get = (path: string, token = 'driver') =>
      request(server)
        .get('/api/v1' + path)
        .auth(token, { type: 'bearer' });
    const post = (path: string, body: object, token = 'driver') =>
      request(server)
        .post('/api/v1' + path)
        .auth(token, { type: 'bearer' })
        .send(body);
    const png = new PNG({ width: 64, height: 32 });
    png.data.fill(255);
    for (let x = 5; x < 55; x++) {
      const i = (15 * 64 + x) * 4;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = 0;
    }
    const bytes = PNG.sync.write(png),
      image = 'data:image/png;base64,' + bytes.toString('base64');
    const uploads: Record<string, { id: string; versionId: string }> = {};
    for (const type of ['BOL', 'POD']) {
      const result = await request(server)
        .post(`/api/v1/me/loads/${load.id}/documents/${type}`)
        .auth('driver', { type: 'bearer' })
        .attach('file', bytes, {
          filename: `fictional-${type}.png`,
          contentType: 'image/png',
        })
        .expect(201);
      uploads[type] = (
        result.body as { document: { id: string; versionId: string } }
      ).document;
    }
    check('Original BOL/POD upload succeeds without any signature');
    const bol = uploads.BOL,
      pod = uploads.POD,
      path = `/documents/${bol.id}/signatures`;
    const before = await db.documentVersion.findUniqueOrThrow({
      where: { id: bol.versionId },
    });
    const requirementsBefore = await db.loadRequirement.findMany({
      where: { loadId: load.id },
      orderBy: { id: 'asc' },
    });
    const payload = (extra: object = {}) => ({
      documentVersionId: bol.versionId,
      signerName: '  Fictional Signer  ',
      signerRole: 'SHIPPER',
      image,
      idempotencyKey: randomUUID(),
      ...extra,
    });
    const idem = payload();
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () => post(path, idem).expect(201)),
    );
    const first = concurrent[0].body as { id: string; signedAt: string };
    assert.ok(
      concurrent.every(
        (response) => (response.body as { id: string }).id === first.id,
      ),
    );
    assert.equal(
      await db.documentSignature.count({ where: { documentId: bol.id } }),
      1,
    );
    assert.equal(
      await db.loadEvent.count({
        where: { loadId: load.id, type: 'DOCUMENT_SIGNATURE_CAPTURED' },
      }),
      1,
    );
    await post(path, { ...idem, signerName: 'Changed name' }).expect(409);
    check(
      'Concurrent double-save/retry creates one immutable record and one audit event; changed retry conflicts',
    );
    await post(path, payload({ signerRole: 'DRIVER' })).expect(201);
    for (const signerRole of ['RECEIVER', 'DRIVER'])
      await post(
        `/documents/${pod.id}/signatures`,
        payload({ documentVersionId: pod.versionId, signerRole }),
      ).expect(201);
    check('BOL Driver/Shipper and POD Driver/Receiver combinations');
    for (const role of ['owner', 'office', 'dispatch', 'driver']) {
      await get(path, role).expect(200);
      await get(`${path}/${first.id}/content`, role)
        .expect(200)
        .expect('Content-Type', /image\/png/)
        .expect('Cache-Control', 'private, no-store');
    }
    for (const role of ['owner', 'office', 'dispatch'])
      await post(path, payload(), role).expect(403);
    await get(path, 'invalid').expect(401);
    await get(path, 'foreign').expect(404);
    await get(path, 'unrelated').expect(404);
    await post(path, payload(), 'unrelated').expect(404);
    await get(`${path}/${first.id}/content`, 'foreign').expect(404);
    await get(`${path}/${first.id}/content`, 'unrelated').expect(404);
    await get(`/documents/${pod.id}/signatures/${first.id}/content`).expect(
      404,
    );
    await get(`${path}/not-a-uuid/content`).expect(400);
    check(
      'Narrow capture roles; existing reviewer read roles; unrelated Driver/tenant/content paths denied',
    );
    for (const extra of [
      { signerName: '  ' },
      { signerName: 'x'.repeat(121) },
      { image: '' },
      { image: 'data:image/png;base64,bm90cG5n' },
      { image: 'data:image/jpeg;base64,aGVsbG8=' },
      { image: 'x'.repeat(91000) },
      { signerRole: 'RECEIVER' },
      { signerRole: 'OWNER' },
      { signedAt: '2000-01-01' },
      { organizationId: other },
      { loadId: randomUUID() },
      { createdByUserId: randomUUID() },
      { signatureStorageKey: '../../private' },
    ])
      await post(path, payload(extra)).expect(400);
    const blank = new PNG({ width: 20, height: 20 });
    blank.data.fill(255);
    await post(
      path,
      payload({
        image:
          'data:image/png;base64,' + PNG.sync.write(blank).toString('base64'),
      }),
    ).expect(400);
    await post(
      `/documents/${pod.id}/signatures`,
      payload({ documentVersionId: pod.versionId, signerRole: 'SHIPPER' }),
    ).expect(400);
    await post(path, payload({ documentVersionId: pod.versionId })).expect(404);
    const foreignDoc = await db.document.create({
      data: { organizationId: other, type: 'BOL' },
    });
    const foreignVersion = await db.documentVersion.create({
      data: {
        organizationId: other,
        documentId: foreignDoc.id,
        versionNumber: 1,
        originalFileName: 'fictional',
        mimeType: 'image/png',
        sizeBytes: 1,
        checksum: 'x'.repeat(64),
        storageKey: `documents/${foreignDoc.id}/${randomUUID()}.png`,
      },
    });
    await post(path, payload({ documentVersionId: foreignVersion.id })).expect(
      404,
    );
    await post(
      `/documents/${foreignDoc.id}/signatures`,
      payload({ documentVersionId: foreignVersion.id }),
    ).expect(404);
    const ratecon = await db.document.create({
      data: { organizationId: org, type: 'RATE_CONFIRMATION' },
    });
    await db.loadDocument.create({
      data: {
        organizationId: org,
        loadId: load.id,
        documentId: ratecon.id,
        role: 'RATE_CONFIRMATION',
      },
    });
    await post(`/documents/${ratecon.id}/signatures`, payload()).expect(400);
    check(
      'Blank/malformed/oversized/type/name/role/version and server-owned fields rejected',
    );
    const stored = await db.documentSignature.findUniqueOrThrow({
      where: { id: first.id },
    });
    const content = await store.read(stored.signatureStorageKey);
    assert.equal(
      createHash('sha256').update(content).digest('hex'),
      stored.signatureChecksum,
    );
    assert.equal(stored.organizationId, org);
    assert.equal(stored.loadId, load.id);
    assert.equal(stored.createdByUserId, driver.userId);
    assert.ok(
      Math.abs(Date.now() - new Date(first.signedAt).getTime()) < 60000,
    );
    assert.deepEqual(
      await db.documentVersion.findUniqueOrThrow({
        where: { id: bol.versionId },
      }),
      before,
    );
    assert.deepEqual(await store.read(before.storageKey), bytes);
    assert.deepEqual(
      await db.loadRequirement.findMany({
        where: { loadId: load.id },
        orderBy: { id: 'asc' },
      }),
      requirementsBefore,
    );
    assert.equal(
      (await db.load.findUniqueOrThrow({ where: { id: load.id } })).status,
      'IN_TRANSIT',
    );
    await assert.rejects(
      db.documentSignature.update({
        where: { id: first.id },
        data: { signerName: 'Mutated' },
      }),
    );
    await assert.rejects(
      db.documentSignature.create({
        data: {
          ...stored,
          id: randomUUID(),
          documentVersionId: foreignVersion.id,
          idempotencyKey: randomUUID(),
          signatureStorageKey: `documents/${bol.id}/${randomUUID()}.png`,
        },
      }),
    );
    check(
      'Server associations/time/checksum; unchanged original evidence and readiness; DB immutability/tenant FK',
    );
    storageFailure = true;
    const count = await db.documentSignature.count({
      where: { organizationId: org },
    });
    const failure = await post(path, payload()).expect(503);
    assert.doesNotMatch(JSON.stringify(failure.body), /private-path/);
    assert.equal(
      await db.documentSignature.count({ where: { organizationId: org } }),
      count,
    );
    storageFailure = false;
    check('Storage failure commits neither signature nor operational change');
    const req = requirementsBefore.find((row) => row.documentType === 'BOL')!;
    await post(
      `/back-office/loads/${load.id}/requirements/${req.id}/reject`,
      { versionId: bol.versionId, reason: 'Fictional correction' },
      'office',
    ).expect(200);
    const corrected = await request(server)
      .post(`/api/v1/me/loads/${load.id}/documents/BOL`)
      .auth('driver', { type: 'bearer' })
      .attach('file', bytes, {
        filename: 'corrected.png',
        contentType: 'image/png',
      })
      .expect(201);
    const next = (corrected.body as { document: { versionId: string } })
      .document;
    const listed = await get(path).expect(200);
    assert.ok(
      (
        listed.body as { signatures: { documentVersionId: string }[] }
      ).signatures.every((row) => row.documentVersionId === bol.versionId),
    );
    assert.equal(
      await db.documentSignature.count({
        where: { documentVersionId: next.versionId },
      }),
      0,
    );
    await post(path, payload()).expect(409);
    await post(path, idem).expect(201);
    await post(path, payload({ documentVersionId: next.versionId })).expect(
      201,
    );
    check(
      'Corrected version starts unsigned; previous evidence stays on old version; old retry remains idempotent',
    );
    console.log(
      `Signature isolated database/HTTP gate: ${checks} scenarios PASS`,
    );
  } finally {
    await db.documentSignature.deleteMany({
      where: { organizationId: { in: [org, other] } },
    });
    await db.organization.deleteMany({ where: { id: { in: [org, other] } } });
    if (app) await app.close();
    else await db.$disconnect();
    if (originalStorage === undefined) delete process.env.DOCUMENT_STORAGE_ROOT;
    else process.env.DOCUMENT_STORAGE_ROOT = originalStorage;
    assert.ok(
      resolve(root).startsWith(testRoot + sep),
      'Invalid cleanup directory',
    );
    await rm(root, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Signature test failed',
  );
  process.exitCode = 1;
});
