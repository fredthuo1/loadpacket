import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import {
  ValidationPipe,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { CanvasFactory } from 'pdf-parse/worker';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TokenVerifier } from '../src/auth/token-verifier';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { LocalRateConProcessor } from '../src/documents/ratecon-processor';
import type { RateConDraftResponse } from '../../../packages/api-contracts/ratecon';
import type { CreateLoadDto } from '../src/loads/create-load.dto';
import {
  DocumentIntelligenceService,
  PIPELINE,
} from '../src/documents/document-intelligence.service';
import { DocumentsService } from '../src/documents/documents.service';
import { DocumentStorage } from '../src/documents/document-storage';
import { RateConDraftService } from '../src/documents/ratecon-draft.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import type { ProcessedText } from '../src/documents/ratecon-processor';

async function main() {
  const db = new PrismaService();
  let app: INestApplication | undefined;
  const groups: string[] = [];
  let http = 0,
    success = false;
  const pass = (s: string) => {
    groups.push(s);
    console.log('PASS ' + s);
  };
  try {
    await db.$connect();
    const [target] = await db.$queryRaw<
      { db: string; host: string; port: number; dir: string }[]
    >`SELECT current_database() db,host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') dir`;
    assert.equal(target.db, 'loadpacket_finance_verified_test');
    assert.equal(target.host, '127.0.0.1');
    assert.equal(target.port, 55439);
    assert.equal(
      target.dir.replaceAll('\\', '/').toLowerCase(),
      resolve('../finance-postgres').replaceAll('\\', '/').toLowerCase(),
    );
    const migrations = await db.$queryRaw<
      {
        migration_name: string;
        checksum: string;
        finished_at: Date;
        rolled_back_at: Date | null;
      }[]
    >`SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations`;
    assert.equal(migrations.length, 22);
    for (const m of migrations) {
      assert(m.finished_at && !m.rolled_back_at);
      assert.equal(
        createHash('sha256')
          .update(
            await readFile(
              resolve(
                '../../apps/api/prisma/migrations',
                m.migration_name,
                'migration.sql',
              ),
            ),
          )
          .digest('hex'),
        m.checksum,
      );
    }
    pass('Isolated identity and all 22 migration checksums');
    let builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db);
    const accounts = new Set<string>();
    if (process.env.INTELLIGENCE_BROWSER_FIXTURE !== '1')
      builder = builder.overrideProvider(TokenVerifier).useValue({
        verify: (token: string) => {
          if (!accounts.has(token)) throw new UnauthorizedException();
          return Promise.resolve({ sub: token });
        },
      });
    app = (await builder.compile()).createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new PrismaExceptionFilter());
    app.enableCors({ origin: 'http://127.0.0.1:3100' });
    await app.init();
    if (process.env.INTELLIGENCE_BROWSER_FIXTURE === '1') {
      await app.listen(3105, '127.0.0.1');
      console.log('B3 real database API ready');
      await new Promise<void>((done) => {
        process.once('SIGTERM', done);
        process.once('SIGINT', done);
      });
      success = true;
      return;
    }
    const server = app.getHttpServer() as Server;
    const org = await db.organization.create({
        data: { name: 'Fictional OCR Carrier' },
      }),
      otherOrg = await db.organization.create({
        data: { name: 'Fictional Other OCR Carrier' },
      });
    const make = async (
      role: 'OWNER' | 'DISPATCHER' | 'BACK_OFFICE',
      organizationId = org.id,
    ) => {
      const sub = randomUUID();
      accounts.add(sub);
      return db.user.create({
        data: {
          organizationId,
          authUserId: sub,
          email: `${sub}@example.invalid`,
          role,
          firstName: 'Fictional',
          lastName: role,
        },
      });
    };
    const owner = await make('OWNER'),
      foreign = await make('OWNER', otherOrg.id),
      office = await make('BACK_OFFICE'),
      dispatcher = await make('DISPATCHER');
    const post = async (
      path: string,
      body: object,
      expected = 201,
      actor = owner,
    ) => {
      const r = await request(server)
        .post('/api/v1' + path)
        .set('Authorization', `Bearer ${actor.authUserId}`)
        .send(body);
      http++;
      assert.equal(r.status, expected, `${path} HTTP ${r.status}`);
      return r;
    };
    const upload = async (
      bytes: Buffer,
      name: string,
      mime: string,
      actor = owner,
      expected = 201,
    ) => {
      const r = await request(server)
        .post('/api/v1/documents/ratecon')
        .set('Authorization', `Bearer ${actor.authUserId}`)
        .attach('file', bytes, { filename: name, contentType: mime });
      http++;
      assert.equal(r.status, expected, `Upload HTTP ${r.status}`);
      return r.body as { id: string; duplicate: boolean; checksum: string };
    };
    const lines = [
      'Rate Confirmation',
      'Load Number: OCR-123',
      'Broker: Fictional Freight LLC',
      'Broker Contact: Pat Example',
      'Equipment: Dry Van',
      'Linehaul: 1000.25',
      'Fuel Surcharge: 99.75',
      'Total Rate: USD 1100.00',
      'Payment Terms: Net 30 days',
      'Pickup',
      'Facility: Fictional Origin',
      'Address: 100 Main St, Austin, TX 78701',
      'Appointment: Monday 8 AM',
      'Pickup Number: PU-123',
      'Delivery',
      'Facility: Fictional Receiver',
      'Address: 200 Main St, Dallas, TX 75001',
      'Appointment: Tuesday 9 AM',
      'Delivery Number: DEL-123',
      'Required Documents',
      'BOL',
      'POD',
      'Carrier Invoice',
    ];
    const canvas = new CanvasFactory().create(1500, 1800);
    assert(canvas.canvas && canvas.context);
    canvas.context.fillStyle = 'white';
    canvas.context.fillRect(0, 0, 1500, 1800);
    canvas.context.fillStyle = 'black';
    canvas.context.font = '32px Arial';
    lines.forEach((line, i) => canvas.context!.fillText(line, 70, 80 + i * 60));
    const png = canvas.canvas.toBuffer('image/png'),
      jpg = canvas.canvas.toBuffer('image/jpeg');
    const textPdf = await PDFDocument.create(),
      font = await textPdf.embedFont(StandardFonts.Helvetica);
    const page = textPdf.addPage([600, 800]);
    lines.forEach((l, i) =>
      page.drawText(l, { x: 35, y: 760 - i * 29, size: 12, font }),
    );
    const pdf = Buffer.from(await textPdf.save());
    const scan = await PDFDocument.create(),
      embedded = await scan.embedPng(png);
    scan
      .addPage([600, 720])
      .drawImage(embedded, { x: 0, y: 0, width: 600, height: 720 });
    const scanPdf = Buffer.from(await scan.save());
    const mixed = await PDFDocument.load(pdf);
    mixed.addPage([600, 720]).drawImage(await mixed.embedPng(png), {
      x: 0,
      y: 0,
      width: 600,
      height: 720,
    });
    await mkdir('fixtures', { recursive: true });
    await writeFile('fixtures/scanned.pdf', scanPdf);
    await writeFile('fixtures/ratecon.png', png);
    await writeFile('fixtures/ratecon.jpg', jpg);
    await writeFile('fixtures/text.pdf', pdf);
    const original = await upload(pdf, 'text.pdf', 'application/pdf');
    const duplicate = await upload(pdf, 'renamed.pdf', 'application/pdf');
    assert.equal(original.id, duplicate.id);
    assert(duplicate.duplicate);
    const foreignCopy = await upload(
      pdf,
      'text.pdf',
      'application/pdf',
      foreign,
    );
    assert.notEqual(original.id, foreignCopy.id);
    await upload(
      Buffer.from('spoof'),
      'fake.pdf',
      'application/pdf',
      owner,
      400,
    );
    await upload(
      Buffer.alloc(10485761),
      'huge.pdf',
      'application/pdf',
      owner,
      413,
    );
    await upload(png, 'fake.pdf', 'application/pdf', owner, 400);
    await upload(pdf, 'text.pdf', 'application/pdf', office, 403);
    pass(
      'Upload signatures, size, tenant-local duplicate detection and role authorization',
    );
    const first = (await post(`/documents/${original.id}/intelligence`, {}))
      .body as RateConDraftResponse;
    assert.equal(first.intelligence!.status, 'SUCCEEDED');
    assert.equal(first.intelligence!.pages[0].method, 'PDF_TEXT');
    assert.equal(first.totalRate, '1100.00');
    assert.equal(first.intelligence!.fields.paymentTermsDays.value, 30);
    const again = (await post(`/documents/${original.id}/intelligence`, {}))
      .body as RateConDraftResponse;
    assert.equal(again.intelligence!.runId, first.intelligence!.runId);
    assert.equal(again.intelligence!.attemptCount, 1);
    const legacy = (await post(`/documents/${original.id}/ratecon-draft`, {}))
      .body as RateConDraftResponse;
    assert.equal(legacy.intelligence!.runId, first.intelligence!.runId);
    assert.equal(
      (
        (await post(`/documents/${original.id}/extract-text`, {})).body as {
          status: string;
        }
      ).status,
      'TEXT_EXTRACTED',
    );
    for (const [actor, status] of [
      [owner, 200],
      [foreign, 404],
      [office, 403],
    ] as const) {
      const response = await request(server)
        .get(`/api/v1/documents/${original.id}/intake-preview`)
        .set('Authorization', `Bearer ${actor.authUserId}`);
      http++;
      assert.equal(response.status, status);
      if (status === 200)
        assert.match(String(response.headers['cache-control']), /no-store/);
    }
    await post(`/documents/${original.id}/intelligence`, {}, 404, foreign);
    await post(`/documents/${original.id}/intelligence`, {}, 403, office);
    pass(
      'Deterministic-first extraction, persisted provenance/cache and tenant isolation',
    );
    for (const [bytes, name, mime] of [
      [png, 'image.png', 'image/png'],
      [jpg, 'image.jpg', 'image/jpeg'],
      [scanPdf, 'scan.pdf', 'application/pdf'],
      [Buffer.from(await mixed.save()), 'mixed.pdf', 'application/pdf'],
    ] as const) {
      const doc = await upload(bytes, name, mime);
      const draft = (
        await post(`/documents/${doc.id}/intelligence`, {}, 201, dispatcher)
      ).body as RateConDraftResponse;
      assert.equal(
        draft.intelligence!.status,
        'SUCCEEDED',
        `${name} ${draft.intelligence!.errorCode}`,
      );
      assert.equal(draft.totalRate, '1100.00');
      assert(draft.intelligence!.pages.some((p) => p.method === 'LOCAL_OCR'));
      if (name === 'mixed.pdf') {
        assert.equal(draft.intelligence!.pages.length, 2);
        assert.equal(
          draft.intelligence!.pages.filter((p) => p.method === 'LOCAL_OCR')
            .length,
          1,
        );
      }
    }
    pass('Actual local OCR: PNG, JPEG, scanned PDF and mixed multi-page PDF');
    const tooMany = await PDFDocument.create();
    for (let n = 0; n < 11; n++) tooMany.addPage();
    const limited = await upload(
      Buffer.from(await tooMany.save()),
      'pages.pdf',
      'application/pdf',
    );
    const failed = (await post(`/documents/${limited.id}/intelligence`, {}))
      .body as RateConDraftResponse;
    assert.equal(failed.intelligence!.errorCode, 'PAGE_LIMIT');
    assert(failed.intelligence!.retryAllowed);
    const retry = (
      await post(`/documents/${limited.id}/intelligence`, { retry: true })
    ).body as RateConDraftResponse;
    assert.equal(retry.intelligence!.attemptCount, 2);
    assert(!retry.intelligence!.retryAllowed);
    const exhausted = (
      await post(`/documents/${limited.id}/intelligence`, { retry: true })
    ).body as RateConDraftResponse;
    assert.equal(exhausted.intelligence!.attemptCount, 2);
    pass(
      'Over-limit PDF, persisted failure, explicit retry bound and manual fallback draft',
    );
    const dto: CreateLoadDto = {
      documentId: original.id,
      processingRunId: first.intelligence!.runId,
      confirmationKey: randomUUID(),
      reviewConfirmed: true,
      currency: 'USD',
      paymentTermsDays: 0,
      loadNumber: `B3-${randomUUID()}`,
      brokerName: 'Human Corrected Broker',
      totalRate: '1100.00',
      linehaul: '1000.25',
      fuelSurcharge: '99.75',
      pickup: { facilityName: 'Origin', address: '100 Main St' },
      delivery: { facilityName: 'Receiver', address: '200 Main St' },
      requirements: [{ documentType: 'BOL', requirement: 'REQUIRED' }],
    };
    await post('/loads', { ...dto, reviewConfirmed: false }, 400);
    await post('/loads', dto, 404, foreign);
    const responses = await Promise.all([
      post('/loads', dto),
      post('/loads', dto),
    ]);
    const loadId = (responses[0].body as { load: { id: string } }).load.id;
    assert.equal(
      (responses[1].body as { load: { id: string } }).load.id,
      loadId,
    );
    await post('/loads', { ...dto, totalRate: '1200.00' }, 409);
    const reviewed = await db.documentProcessingRun.findUniqueOrThrow({
      where: { id: dto.processingRunId },
    });
    assert(reviewed.review);
    assert.equal(reviewed.createdLoadId, loadId);
    assert.equal(
      (await db.load.findUniqueOrThrow({ where: { id: loadId } }))
        .paymentTermsDays,
      0,
    );
    assert.equal(
      (reviewed.review as { corrections: { brokerName: { state: string } } })
        .corrections.brokerName.state,
      'CORRECTED',
    );
    await assert.rejects(
      db.documentProcessingRun.update({
        where: { id: reviewed.id },
        data: { errorCode: 'tamper' },
      }),
    );
    assert.equal(
      (
        await db.documentVersion.findUniqueOrThrow({
          where: { id: reviewed.documentVersionId },
        })
      ).checksum,
      original.checksum,
    );
    pass(
      'Explicit atomic human review, concurrent confirmation, corrections, B1a terms and immutable evidence',
    );
    const manual = {
      ...dto,
      documentId: limited.id,
      processingRunId: failed.intelligence!.runId,
      confirmationKey: randomUUID(),
      loadNumber: `MANUAL-${randomUUID()}`,
    };
    await post('/loads', manual);
    const manualRun = await db.documentProcessingRun.findUniqueOrThrow({
      where: { id: manual.processingRunId },
    });
    assert.equal((manualRun.review as { manual: boolean }).manual, true);
    pass('Load creation from failed OCR after explicit manual verification');
    // Controlled worker timing; real database, locks, storage, guards and service.
    const fresh = async (label: string, actor = owner) => {
      const source = await PDFDocument.load(pdf);
      source.setTitle(label + randomUUID());
      return upload(
        Buffer.from(await source.save()),
        'race.pdf',
        'application/pdf',
        actor,
      );
    };
    const actor: AuthenticatedUser = {
      ...owner,
      driverId: null,
      driverName: null,
    };
    const text: ProcessedText = {
      pages: [{ page: 1, text: lines.join('\n'), method: 'PDF_TEXT' }],
      ocrPages: 0,
      characters: lines.join('\n').length,
    };
    let release!: (value: ProcessedText) => void, entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const paused = new DocumentIntelligenceService(
      db,
      app.get(DocumentsService),
      app.get(RateConDraftService),
      {
        process: () => {
          entered();
          return new Promise((resolve) => {
            release = resolve;
          });
        },
      },
    );
    const fast = new DocumentIntelligenceService(
      db,
      app.get(DocumentsService),
      app.get(RateConDraftService),
      { process: () => Promise.resolve(text) },
    );
    const raceDoc = await fresh('race');
    const late = paused.process(actor, raceDoc.id);
    // Attach rejection handling before manipulating the worker lease.
    const lateRejected = assert.rejects(late, /expired/);
    await started;
    await assert.rejects(fast.process(actor, raceDoc.id), /processing/);
    const otherDoc = await fresh('capacity');
    await assert.rejects(fast.process(actor, otherDoc.id), /capacity/);
    const running = await db.documentProcessingRun.findFirstOrThrow({
      where: { documentId: raceDoc.id },
    });
    await db.documentProcessingRun.update({
      where: { id: running.id },
      data: {
        status: 'FAILED',
        leaseToken: null,
        leaseExpiresAt: null,
        finishedAt: new Date(),
        errorCode: 'WORKER_INTERRUPTED',
        attempts: [
          {
            attempt: 1,
            outcome: 'WORKER_INTERRUPTED',
            reservedPages: 10,
            tokens: 0,
          },
        ],
      },
    });
    const replacement = await fast.process(actor, raceDoc.id, true);
    release(text);
    await lateRejected;
    const stable = await db.documentProcessingRun.findUniqueOrThrow({
      where: { id: running.id },
    });
    assert.equal(stable.status, 'SUCCEEDED');
    assert.equal(stable.attemptCount, 2);
    assert.equal((stable.attempts as unknown[]).length, 2);
    // A new service instance must use persisted success without invoking its worker.
    const restarted = new DocumentIntelligenceService(
      db,
      app.get(DocumentsService),
      app.get(RateConDraftService),
      {
        process: () => {
          throw Error('Cached work must not rerun');
        },
      },
    );
    assert.equal(
      (await restarted.process(actor, raceDoc.id)).intelligence.runId,
      replacement.intelligence.runId,
    );
    pass(
      'Concurrent claims, per-tenant admission, superseded worker rejection and persisted restart cache',
    );
    const version = await db.documentVersion.findFirstOrThrow({
      where: { documentId: otherDoc.id },
    });
    const seedRun = (
      organizationId: string,
      userId: string,
      documentId: string,
      versionId: string,
      checksum: string,
      key: string,
    ) =>
      db.documentProcessingRun.create({
        data: {
          organizationId,
          requestedByUserId: userId,
          documentId,
          documentVersionId: versionId,
          sourceChecksum: checksum,
          pipelineKey: key,
        },
      });
    const expired = await seedRun(
      org.id,
      owner.id,
      otherDoc.id,
      version.id,
      version.checksum,
      createHash('sha256').update(PIPELINE).digest('hex'),
    );
    await db.documentProcessingRun.update({
      where: { id: expired.id },
      data: {
        status: 'RUNNING',
        attemptCount: 1,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() - 1000),
        startedAt: new Date(Date.now() - 200000),
      },
    });
    const recovered = await fast.process(actor, otherDoc.id);
    assert.equal(recovered.intelligence.status, 'FAILED');
    assert.equal(recovered.intelligence.errorCode, 'WORKER_INTERRUPTED');
    assert.equal(
      (await fast.process(actor, otherDoc.id, true)).intelligence.attemptCount,
      2,
    );
    await assert.rejects(
      seedRun(
        otherOrg.id,
        foreign.id,
        otherDoc.id,
        version.id,
        version.checksum,
        'f'.repeat(64),
      ),
    );
    // A separately uploaded immutable version is appended without editing old evidence.
    const replacementDoc = await fresh('replacement');
    const replacementVersion = await db.documentVersion.findFirstOrThrow({
      where: { documentId: replacementDoc.id },
    });
    const {
      id: _id,
      createdAt: _createdAt,
      ...versionData
    } = replacementVersion;
    void _id;
    void _createdAt;
    const newKey = `documents/${raceDoc.id}/v2.pdf`;
    await app
      .get(DocumentStorage)
      .put(
        newKey,
        await app.get(DocumentStorage).read(replacementVersion.storageKey),
      );
    await db.documentVersion.create({
      data: {
        ...versionData,
        id: randomUUID(),
        documentId: raceDoc.id,
        versionNumber: 2,
        storageKey: newKey,
        uploadKey: null,
      },
    });
    await post(
      '/loads',
      {
        ...dto,
        documentId: raceDoc.id,
        processingRunId: replacement.intelligence.runId,
        confirmationKey: randomUUID(),
      },
      409,
    );
    pass(
      'Expired lease recovery, composite tenant FK and stale source confirmation rejection',
    );
    // Seed reserved attempts on a separate fictional tenant to verify the daily boundary.
    const foreignVersion = await db.documentVersion.findFirstOrThrow({
      where: { documentId: foreignCopy.id },
    });
    for (let n = 0; n < 50; n++) {
      const row = await seedRun(
        otherOrg.id,
        foreign.id,
        foreignCopy.id,
        foreignVersion.id,
        foreignVersion.checksum,
        createHash('sha256').update(`quota-${n}`).digest('hex'),
      );
      for (let attempt = 1; attempt <= 2; attempt++) {
        await db.documentProcessingRun.update({
          where: { id: row.id },
          data: {
            status: 'RUNNING',
            attemptCount: attempt,
            leaseToken: randomUUID(),
            leaseExpiresAt: new Date(Date.now() + 150000),
            startedAt: new Date(),
            finishedAt: null,
          },
        });
        await db.documentProcessingRun.update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            leaseToken: null,
            leaseExpiresAt: null,
            finishedAt: new Date(),
            errorCode: 'SYNTHETIC_FAILURE',
            attempts: Array.from({ length: attempt }, (_, i) => ({
              attempt: i + 1,
              outcome: 'SYNTHETIC_FAILURE',
              reservedPages: 10,
              tokens: 0,
            })),
          },
        });
      }
    }
    await post(`/documents/${foreignCopy.id}/intelligence`, {}, 409, foreign);
    pass(
      'Persisted 100-attempt daily tenant allowance rejects additional processing',
    );
    const processor = new LocalRateConProcessor();
    await assert.rejects(
      processor.process(Buffer.from('%PDF-1.7\n%%EOF'), 'application/pdf'),
    );
    pass('Malformed parser input fails safely inside local worker');
    success = true;
  } finally {
    if (app) await app.close();
    await db.$disconnect();
    if (process.env.INTELLIGENCE_BROWSER_FIXTURE !== '1')
      await writeFile(
        'results.json',
        JSON.stringify({ success, groups, httpRequests: http }, null, 2),
      );
  }
}
void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'B3 acceptance failed');
  process.exitCode = 1;
});
