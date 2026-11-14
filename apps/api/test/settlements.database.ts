import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import {
  ValidationPipe,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TokenVerifier } from '../src/auth/token-verifier';
import {
  DocumentStorage,
  LocalDocumentStorage,
} from '../src/documents/document-storage';
import { SettlementsService } from '../src/finance/settlements.service';
import { FinanceService } from '../src/finance/finance.service';
import { FinanceImportService } from '../src/finance/finance-import.service';
import { AccountsReceivableService } from '../src/loads/accounts-receivable.service';
import { LoadEventsService } from '../src/load-events/load-events.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import type { PrepareSettlementDto } from '../src/finance/settlements.dto';
import type { SettlementReceipt } from '../../../packages/api-contracts/settlements';

async function main() {
  const db = new PrismaService(),
    storage = new LocalDocumentStorage();
  await storage.onModuleInit();
  const service = new SettlementsService(db, storage),
    finance = new FinanceService(
      db,
      new AccountsReceivableService(db, new LoadEventsService(db)),
    );
  const results: string[] = [];
  const pass = (s: string) => {
    results.push(s);
    console.log('PASS ' + s);
  };
  const orgs: string[] = [];
  let app: INestApplication | undefined;
  let success = false;
  try {
    await db.$connect();
    const [identity] = await db.$queryRaw<
      { db: string; host: string; port: number; dir: string }[]
    >`SELECT current_database() db,host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') dir`;
    assert.equal(identity.db, 'loadpacket_finance_verified_test');
    assert.equal(identity.host, '127.0.0.1');
    assert.equal(identity.port, 55439);
    assert.equal(
      identity.dir.replaceAll('\\', '/').toLowerCase(),
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
    for (let n = 0; n < 2; n++)
      orgs.push(
        (
          await db.organization.create({
            data: { name: `Fictional B1d Carrier ${n}` },
          })
        ).id,
      );
    const makeUser = async (
      role: 'OWNER' | 'BACK_OFFICE' | 'DISPATCHER' | 'DRIVER',
      org = orgs[0],
    ): Promise<AuthenticatedUser> => ({
      ...(await db.user.create({
        data: {
          organizationId: org,
          authUserId: randomUUID(),
          email: `${randomUUID()}@example.invalid`,
          firstName: 'Synthetic',
          lastName: role,
          role,
        },
      })),
      driverId: null,
      driverName: null,
    });
    const owner = await makeUser('OWNER'),
      office = await makeUser('BACK_OFFICE'),
      dispatch = await makeUser('DISPATCHER'),
      driverUser = await makeUser('DRIVER'),
      foreign = await makeUser('OWNER', orgs[1]);
    const driver = await db.driver.create({
      data: {
        organizationId: orgs[0],
        firstName: 'Fictional',
        lastName: 'Driver',
        userId: driverUser.id,
      },
    });
    const fixture = async (u = owner, did?: string) => {
      const d = did
        ? await db.driver.findUniqueOrThrow({ where: { id: did } })
        : await db.driver.create({
            data: {
              organizationId: u.organizationId,
              firstName: 'Fixture',
              lastName: randomUUID(),
            },
          });
      const load = await db.load.create({
        data: {
          organizationId: u.organizationId,
          loadNumber: `B1D-${randomUUID()}`,
          brokerName: 'Fictional Broker',
          status: 'DELIVERED',
          totalRate: '9999',
        },
      });
      const at = new Date('2026-10-15T18:00:00.000Z');
      const a = await db.loadAssignment.create({
        data: {
          organizationId: u.organizationId,
          loadId: load.id,
          driverId: d.id,
          status: 'COMPLETED',
          assignedAt: new Date('2026-10-14T12:00:00Z'),
          acceptedAt: new Date('2026-10-14T13:00:00Z'),
          completedAt: at,
        },
      });
      const e = await db.loadEvent.create({
        data: {
          organizationId: u.organizationId,
          loadId: load.id,
          type: 'LOAD_COMPLETED',
          actorType: 'OWNER',
          actorId: u.id,
          occurredAt: at,
          metadata: { assignmentId: a.id, assignmentStatus: 'COMPLETED' },
        },
      });
      const dto: PrepareSettlementDto = {
        driverId: d.id,
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        currency: 'USD',
        loadIds: [load.id],
        items: [
          {
            kind: 'PER_LOAD',
            loadId: load.id,
            amount: '100.00',
            description: 'Explicit completed work compensation',
          },
        ],
        idempotencyKey: randomUUID(),
      };
      return { d, load, a, e, dto };
    };
    const initial = await fixture(owner, driver.id);
    const tokens: Record<string, AuthenticatedUser> = {
      owner,
      office,
      dispatch,
      driver: driverUser,
      foreign,
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(DocumentStorage)
      .useValue(storage)
      .overrideProvider(TokenVerifier)
      .useValue({
        verify: (token: string) => {
          if (!tokens[token]) throw new UnauthorizedException();
          return Promise.resolve({ sub: tokens[token].authUserId });
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
    if (process.env.SETTLEMENT_BROWSER_FIXTURE === '1') {
      await writeFile(
        'browser-fixture.json',
        JSON.stringify({
          driverId: driver.id,
          loadId: initial.load.id,
          loadNumber: initial.load.loadNumber,
        }),
      );
      await app.listen(3103, '127.0.0.1');
      console.log('Settlement browser fixture ready on 127.0.0.1:3103');
      await new Promise<void>((done) => {
        process.once('SIGTERM', done);
        process.once('SIGINT', done);
      });
      return;
    }
    const api = request(app.getHttpServer() as Server),
      endpoint = '/api/v1/finance/settlements';
    for (const token of ['driver', 'dispatch'])
      await api.get(endpoint).auth(token, { type: 'bearer' }).expect(403);
    await api.get(endpoint).expect(401);
    await api.get(endpoint).auth('office', { type: 'bearer' }).expect(200);
    await api
      .get('/api/v1/finance/payroll')
      .auth('office', { type: 'bearer' })
      .expect(403);
    await api
      .post(endpoint)
      .auth('owner', { type: 'bearer' })
      .send({ ...initial.dto, organizationId: orgs[1] })
      .expect(400);
    await api
      .post(endpoint)
      .auth('owner', { type: 'bearer' })
      .send({ ...initial.dto, currency: 'CAD' })
      .expect(400);
    const draft = await service.prepare(office, initial.dto);
    assert.equal(draft.totals.net, '100.00');
    assert.deepEqual(await service.prepare(office, initial.dto), draft);
    await assert.rejects(
      service.prepare(office, {
        ...initial.dto,
        items: [{ ...initial.dto.items[0], amount: '101' }],
      }),
      /Idempotency/,
    );
    await api
      .get(`${endpoint}/${draft.id}`)
      .auth('foreign', { type: 'bearer' })
      .expect(404);
    pass('HTTP roles/tenant/DTO gates and exact prepare replay');
    const review = await service.review(owner, draft.id, {
      revision: 1,
      idempotencyKey: randomUUID(),
    });
    const edited = await service.edit(owner, draft.id, {
      revision: 1,
      idempotencyKey: randomUUID(),
      loadIds: initial.dto.loadIds,
      items: [
        ...initial.dto.items,
        { kind: 'BONUS', amount: '0.20', description: 'Reviewed bonus' },
        {
          kind: 'DEDUCTION',
          amount: '0.10',
          description: 'Reviewed deduction',
        },
      ],
    });
    assert.equal(edited.state, 'DRAFT');
    assert.equal(edited.revision, 2);
    assert.equal(edited.reviewedAt, null);
    assert.equal(edited.totals.net, '100.10');
    await assert.rejects(
      service.approve(owner, draft.id, {
        revision: review.revision,
        idempotencyKey: randomUUID(),
      }),
      /stale/,
    );
    await service.review(owner, draft.id, {
      revision: 2,
      idempotencyKey: randomUUID(),
    });
    const approved = await service.approve(office, draft.id, {
      revision: 2,
      idempotencyKey: randomUUID(),
    });
    const bytes = await service.download(owner, draft.id);
    assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
    const version = await db.documentVersion.findUniqueOrThrow({
      where: { id: approved.documentVersionId! },
    });
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      version.checksum,
    );
    for (const token of ['owner', 'office', 'dispatch', 'driver'])
      await api
        .get(`/api/v1/documents/vault/${version.documentId}`)
        .auth(token, { type: 'bearer' })
        .expect(404);
    await api
      .get(`${endpoint}/${draft.id}/statement`)
      .auth('foreign', { type: 'bearer' })
      .expect(404);
    await api
      .get(`${endpoint}/${draft.id}/statement`)
      .auth('driver', { type: 'bearer' })
      .expect(403);
    await api
      .get(`${endpoint}/${draft.id}/statement`)
      .auth('office', { type: 'bearer' })
      .expect(200);
    await assert.rejects(
      service.edit(owner, draft.id, {
        revision: 2,
        idempotencyKey: randomUUID(),
        loadIds: initial.dto.loadIds,
        items: initial.dto.items,
      }),
      /unapproved/,
    );
    await assert.rejects(
      db.driverSettlement.update({
        where: { id: draft.id },
        data: { netAmount: '1' },
      }),
    );
    await assert.rejects(
      db.driverSettlementItem.updateMany({
        where: { settlementId: draft.id },
        data: { amount: '1' },
      }),
    );
    await assert.rejects(
      db.documentVersion.update({
        where: { id: version.id },
        data: { checksum: 'f'.repeat(64) },
      }),
    );
    pass(
      'Review invalidation, exact approval, private PDF/checksum and direct-SQL immutability',
    );
    const pay = {
      revision: 2,
      amount: '40.00',
      currency: 'USD' as const,
      paymentDate: '2026-10-20',
      method: 'ACH' as const,
      reference: 'Fictional transfer',
      idempotencyKey: randomUUID(),
    };
    const paid = await service.pay(owner, draft.id, pay);
    assert.equal(paid.paymentStatus, 'PARTIALLY_PAID');
    assert.equal(paid.remainingPayable, '60.10');
    assert.deepEqual(await service.pay(owner, draft.id, pay), paid);
    await assert.rejects(
      service.pay(owner, draft.id, { ...pay, amount: '41' }),
      /Idempotency/,
    );
    await assert.rejects(
      service.pay(owner, draft.id, {
        ...pay,
        amount: '100',
        idempotencyKey: randomUUID(),
      }),
      /exceeds/,
    );
    await assert.rejects(
      db.driverSettlementPayment.updateMany({
        where: { settlementId: draft.id },
        data: { amount: '1' },
      }),
    );
    await db.driver.update({
      where: { id: driver.id },
      data: { status: 'INACTIVE' },
    });
    const final = await service.pay(owner, draft.id, {
      ...pay,
      amount: '60.10',
      idempotencyKey: randomUUID(),
    });
    assert.equal(final.paymentStatus, 'PAID');
    assert.equal((await service.download(owner, draft.id)).equals(bytes), true);
    pass(
      'Partial/final payments, overpayment, lost-response replay, inactive Driver and unchanged statement',
    );
    const adjustment = async (root: SettlementReceipt, amount: string) =>
      service.prepare(owner, {
        driverId: root.driverId,
        periodStart: root.periodStart,
        periodEnd: root.periodEnd,
        currency: 'USD',
        originalSettlementId: root.id,
        loadIds: [],
        items: [
          { kind: 'ADJUSTMENT', amount, description: 'Reviewed correction' },
        ],
        idempotencyKey: randomUUID(),
      });
    let adj = await adjustment(approved, '10.25');
    adj = await service.review(owner, adj.id, {
      revision: 1,
      idempotencyKey: randomUUID(),
    });
    await service.approve(owner, adj.id, {
      revision: 1,
      idempotencyKey: randomUUID(),
    });
    assert.equal(
      (await service.detail(owner, draft.id)).remainingPayable,
      '10.25',
    );
    const negative = await adjustment(approved, '-10.26');
    await service.review(owner, negative.id, {
      revision: 1,
      idempotencyKey: randomUUID(),
    });
    await assert.rejects(
      service.approve(owner, negative.id, {
        revision: 1,
        idempotencyKey: randomUUID(),
      }),
      /below/,
    );
    const expense = await db.$queryRaw<
      { amount: string }[]
    >`SELECT amount::text FROM finance_records WHERE organization_id=${orgs[0]}::uuid AND id LIKE 'settlement:%'`;
    assert.equal(
      expense.reduce((s, e) => s + BigInt(e.amount.replace('.', '')), 0n),
      11035n,
    );
    assert.equal(
      (
        await finance.payroll(owner, {
          from: '2026-10-01',
          to: '2026-10-31',
          page: 1,
          pageSize: 25,
          sort: 'date',
          direction: 'desc',
        })
      ).preparedPay,
      '0.00',
    );
    pass(
      'Adjustments preserve originals; expense once and payments excluded from legacy payroll',
    );
    for (let iteration = 0; iteration < 3; iteration++) {
      const f = await fixture();
      const race = await Promise.allSettled([
        service.prepare(owner, f.dto),
        service.prepare(owner, { ...f.dto, idempotencyKey: randomUUID() }),
      ]);
      assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
      let s = (
        race.find(
          (r) => r.status === 'fulfilled',
        ) as PromiseFulfilledResult<SettlementReceipt>
      ).value;
      const reviews = await Promise.allSettled([
        service.review(owner, s.id, {
          revision: 1,
          idempotencyKey: randomUUID(),
        }),
        service.review(owner, s.id, {
          revision: 1,
          idempotencyKey: randomUUID(),
        }),
      ]);
      assert.equal(reviews.filter((r) => r.status === 'fulfilled').length, 1);
      const approvals = await Promise.allSettled([
        service.approve(owner, s.id, {
          revision: 1,
          idempotencyKey: randomUUID(),
        }),
        service.approve(owner, s.id, {
          revision: 1,
          idempotencyKey: randomUUID(),
        }),
      ]);
      assert.equal(approvals.filter((r) => r.status === 'fulfilled').length, 1);
      s = await service.detail(owner, s.id);
      const payments = await Promise.allSettled([
        service.pay(owner, s.id, {
          ...pay,
          revision: 1,
          amount: '70',
          idempotencyKey: randomUUID(),
        }),
        service.pay(owner, s.id, {
          ...pay,
          revision: 1,
          amount: '70',
          idempotencyKey: randomUUID(),
        }),
      ]);
      assert.equal(payments.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(
        (await service.detail(owner, s.id)).remainingPayable,
        '30.00',
      );
      const a = await adjustment(s, '-30');
      await service.review(owner, a.id, {
        revision: 1,
        idempotencyKey: randomUUID(),
      });
      const ap = await Promise.allSettled([
        service.approve(owner, a.id, {
          revision: 1,
          idempotencyKey: randomUUID(),
        }),
        service.pay(owner, s.id, {
          ...pay,
          revision: 1,
          amount: '30',
          idempotencyKey: randomUUID(),
        }),
      ]);
      assert.equal(ap.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(
        (await service.detail(owner, s.id)).remainingPayable,
        '0.00',
      );
      for (const action of ['edit', 'cancel'] as const) {
        const g = await fixture();
        const d = await service.prepare(owner, g.dto);
        await service.review(owner, d.id, {
          revision: 1,
          idempotencyKey: randomUUID(),
        });
        const pair = await Promise.allSettled([
          service.approve(owner, d.id, {
            revision: 1,
            idempotencyKey: randomUUID(),
          }),
          action === 'edit'
            ? service.edit(owner, d.id, {
                revision: 1,
                idempotencyKey: randomUUID(),
                loadIds: g.dto.loadIds,
                items: [
                  {
                    kind: 'FLAT',
                    amount: '75',
                    description: 'Revised flat pay',
                  },
                ],
              })
            : service.cancel(owner, d.id, {
                revision: 1,
                idempotencyKey: randomUUID(),
                reason: 'Duplicate preparation',
              }),
        ]);
        assert.equal(pair.filter((r) => r.status === 'fulfilled').length, 1);
      }
    }
    pass(
      'Three iterations: prepare/review/approval races, approval versus edit/cancel, concurrent payments, adjustment versus payment',
    );
    const f = await fixture();
    const cancelled = await service.prepare(owner, f.dto);
    await service.review(owner, cancelled.id, {
      revision: 1,
      idempotencyKey: randomUUID(),
    });
    await service.cancel(owner, cancelled.id, {
      revision: 1,
      idempotencyKey: randomUUID(),
      reason: 'Wrong reviewed amount',
    });
    const replacement = await service.prepare(owner, {
      ...f.dto,
      idempotencyKey: randomUUID(),
    });
    assert.notEqual(replacement.id, cancelled.id);
    assert.equal(
      await db.driverSettlementWork.count({ where: { loadId: f.load.id } }),
      2,
    );
    await assert.rejects(
      service.prepare(owner, {
        ...f.dto,
        periodStart: '2026-10-10',
        idempotencyKey: randomUUID(),
      }),
    );
    const foreignWork = await fixture(foreign);
    await assert.rejects(
      service.prepare(owner, { ...foreignWork.dto, driverId: f.d.id }),
    );
    const ambiguous = await fixture();
    await db.loadEvent.create({
      data: {
        organizationId: orgs[0],
        loadId: ambiguous.load.id,
        type: 'LOAD_COMPLETED',
        metadata: { assignmentId: ambiguous.a.id },
      },
    });
    await assert.rejects(service.prepare(owner, ambiguous.dto), /ambiguous/);
    const inactive = await fixture();
    await db.driver.update({
      where: { id: inactive.d.id },
      data: { status: 'INACTIVE' },
    });
    await service.prepare(owner, inactive.dto);
    pass(
      'Cancellation releases but retains history; overlapping periods, foreign and ambiguous work rejected; inactive historical work accepted',
    );
    const direct = await fixture();
    let directStatement = await service.prepare(owner, direct.dto);
    directStatement = await service.review(owner, directStatement.id, {
      revision: 1,
      idempotencyKey: randomUUID(),
    });
    await service.approve(owner, directStatement.id, {
      revision: 1,
      idempotencyKey: randomUUID(),
    });
    const rawPayment = () =>
      db.driverSettlementPayment.create({
        data: {
          organizationId: orgs[0],
          settlementId: directStatement.id,
          amount: '70',
          currency: 'USD',
          paymentDate: new Date('2026-10-20T00:00:00Z'),
          method: 'CASH',
          recordedById: owner.id,
          idempotencyKey: randomUUID(),
          requestHash: 'a'.repeat(64),
        },
      });
    const rawRace = await Promise.allSettled([rawPayment(), rawPayment()]);
    assert.equal(rawRace.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      (await service.detail(owner, directStatement.id)).remainingPayable,
      '30.00',
    );
    await assert.rejects(
      db.driverSettlementPayment.create({
        data: {
          organizationId: orgs[1],
          settlementId: directStatement.id,
          amount: '1',
          currency: 'USD',
          paymentDate: new Date('2026-10-20T00:00:00Z'),
          method: 'CASH',
          recordedById: foreign.id,
          idempotencyKey: randomUUID(),
          requestHash: 'a'.repeat(64),
        },
      }),
    );
    await assert.rejects(
      db.driverSettlementWork.updateMany({
        where: { settlementId: directStatement.id },
        data: { releasedAt: new Date() },
      }),
    );
    pass(
      'Database payment race without service locks; tenant/payment and immutable work guards',
    );
    const legacy = await fixture();
    await finance.create(owner, {
      type: 'DRIVER_PAY',
      category: 'Driver Pay',
      amount: '50',
      transactionDate: '2026-10-15',
      description: 'Legacy recorded pay',
      driverId: legacy.d.id,
      loadId: legacy.load.id,
      idempotencyKey: randomUUID(),
    });
    await assert.rejects(service.prepare(owner, legacy.dto), /Legacy/);
    const payroll = await finance.payroll(owner, {
      from: '2026-10-01',
      to: '2026-10-31',
      page: 1,
      pageSize: 25,
      sort: 'date',
      direction: 'desc',
    });
    assert.equal(payroll.preparedPay, '50.00');
    assert(
      (
        await finance.payrollExport(owner, {
          page: 1,
          pageSize: 25,
          sort: 'date',
          direction: 'desc',
        })
      ).includes('50.00'),
    );
    await assert.rejects(
      finance.create(owner, {
        type: 'DRIVER_PAY',
        category: 'Driver Pay',
        amount: '10',
        transactionDate: '2026-10-15',
        description: 'Duplicate pay',
        driverId: driver.id,
        loadId: initial.load.id,
        idempotencyKey: randomUUID(),
      }),
      /overlap/,
    );
    const imports = new FinanceImportService(db);
    const csv = Buffer.from(
      'Load Number,Broker,Delivery Date,Gross Revenue,Driver Pay\nHIST-B1D-' +
        randomUUID() +
        ',Fictional Broker,2026-10-15,1000,25\n',
    );
    const batch = await imports.upload(owner, {
      buffer: csv,
      originalname: 'synthetic.csv',
      mimetype: 'text/csv',
      size: csv.length,
    } as Express.Multer.File);
    const mapped = await imports.preview(owner, batch.id, {
      revision: 0,
      mapping: {
        loadNumber: 'Load Number',
        brokerName: 'Broker',
        deliveryDate: 'Delivery Date',
        grossRevenue: 'Gross Revenue',
        driverPay: 'Driver Pay',
      },
    });
    await assert.rejects(
      imports.confirm(owner, batch.id, {
        revision: mapped.revision,
        acceptWarnings: true,
        skipInvalidRows: false,
      }),
      /overlap/,
    );
    pass(
      'Legacy payroll/export unchanged; manual and imported overlapping Driver pay blocked',
    );
    const access = await db.$queryRaw<
      { allowed: boolean }[]
    >`SELECT has_table_privilege(rolname,'driver_settlements','SELECT') allowed FROM pg_roles WHERE rolname IN ('anon','authenticated')`;
    assert(access.every((a) => !a.allowed));
    await assert.rejects(
      db.$executeRaw`DELETE FROM financial_audit_events WHERE record_type='DRIVER_SETTLEMENT' AND record_id=${draft.id}::uuid`,
    );
    pass('Provider table access and immutable settlement command journal');
    success = true;
  } finally {
    await writeFile(
      process.env.SETTLEMENT_BROWSER_FIXTURE === '1'
        ? 'browser-server.json'
        : 'results.json',
      JSON.stringify(
        {
          success,
          results,
          retainedFictionalOrganizations: orgs,
          at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    if (app) await app.close();
    await db.$disconnect();
  }
}
void main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
