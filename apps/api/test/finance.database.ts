import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import {
  UnauthorizedException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TokenVerifier } from '../src/auth/token-verifier';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import type {
  ImportBatch,
  FinanceOverview,
  FinanceTransaction,
} from '../../../packages/api-contracts/finance';
import type {
  FinancialTransaction,
  UserRole,
} from '../src/generated/prisma/client';

async function main() {
  const url = new URL(
    process.env.DATABASE_URL ?? 'postgresql://invalid/invalid',
  );
  assert.equal(process.env.RUN_FINANCE_DATABASE_TESTS, '1');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '55439');
  assert.equal(url.pathname, '/loadpacket_finance_verified_test');
  const db = new PrismaService(),
    org = randomUUID(),
    other = randomUUID(),
    tokens = new Map<string, string>();
  let app: INestApplication | undefined;
  let checks = 0;
  const check = (name: string) => {
    checks++;
    console.log('PASS ' + name);
  };
  try {
    await db.$connect();
    await db.organization.createMany({
      data: [
        { id: org, name: 'Fictional Finance Test A' },
        { id: other, name: 'Fictional Finance Test B' },
      ],
    });
    for (const [token, organizationId, role] of [
      ['owner', org, 'OWNER'],
      ['foreign', other, 'OWNER'],
      ['office', org, 'BACK_OFFICE'],
      ['dispatch', org, 'DISPATCHER'],
      ['driver', org, 'DRIVER'],
    ] as [string, string, UserRole][]) {
      const account = await db.user.create({
        data: {
          organizationId,
          authUserId: randomUUID(),
          role,
          firstName: 'Finance',
          lastName: token,
          email: `${token}@example.invalid`,
        },
      });
      tokens.set(token, account.authUserId);
      if (role === 'DRIVER')
        await db.driver.create({
          data: {
            organizationId,
            userId: account.id,
            firstName: 'Fictional',
            lastName: 'Driver',
          },
        });
    }
    const driver = await db.driver.findFirstOrThrow({
      where: { organizationId: org },
    });
    const load = await db.load.create({
      data: {
        organizationId: org,
        loadNumber: 'LIVE-1',
        brokerName: 'Fictional Broker',
        status: 'INVOICED',
        invoiceNumber: 'LIVE-INV',
        invoiceIssuedAt: new Date('2026-09-10'),
        paymentDueAt: new Date('2026-09-20'),
        totalRate: '1000.00',
      },
    });
    const foreignLoad = await db.load.create({
      data: {
        organizationId: other,
        loadNumber: 'OTHER-1',
        brokerName: 'Foreign Broker',
        totalRate: '99999.00',
      },
    });
    const foreignDoc = await db.document.create({
      data: { organizationId: other, type: 'OTHER' },
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(TokenVerifier)
      .useValue({
        verify: (token: string) => {
          const sub = tokens.get(token);
          if (!sub) throw new UnauthorizedException();
          return Promise.resolve({ sub });
        },
      })
      .compile();
    app = module.createNestApplication({ logger: ['error'] });
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
    const get = (path: string, token = 'owner') =>
      request(server)
        .get('/api/v1/finance' + path)
        .auth(token, { type: 'bearer' });
    const post = (path: string, body: object, token = 'owner') =>
      request(server)
        .post('/api/v1/finance' + path)
        .auth(token, { type: 'bearer' })
        .send(body);
    const entry = (extra: object = {}) => ({
      type: 'EXPENSE',
      category: 'Fuel',
      amount: '0.10',
      transactionDate: '2026-09-15',
      description: 'Fictional fuel',
      idempotencyKey: randomUUID(),
      ...extra,
    });
    const period = '?from=2026-09-01&to=2026-09-30';
    await get('/overview', 'invalid').expect(401);
    for (const role of ['dispatch', 'driver'])
      await get('/overview', role).expect(403);
    await get('/payroll', 'office').expect(403);
    await get('/overview', 'office').expect(200);
    check('Authentication and finance/payroll roles');
    await post('/transactions', entry({ amount: '0.001' })).expect(400);
    await post(
      '/transactions',
      entry({ transactionDate: '2026-02-30' }),
    ).expect(400);
    await post('/transactions', entry({ organizationId: other })).expect(400);
    await get('/transactions?pageSize=1000').expect(400);
    check('Public input validation');
    await post('/transactions', entry({ loadId: foreignLoad.id })).expect(404);
    await post('/transactions', entry({ documentId: foreignDoc.id })).expect(
      404,
    );
    await get('/loads/' + foreignLoad.id).expect(404);
    check('Foreign associations rejected');
    const body = entry({ loadId: load.id });
    const expense = (await post('/transactions', body).expect(201))
      .body as FinancialTransaction;
    const repeated = (await post('/transactions', body).expect(201))
      .body as FinancialTransaction;
    assert.equal(repeated.id, expense.id);
    await post('/transactions', { ...body, amount: '0.20' }).expect(409);
    check('Immutable manual entry idempotency');
    await post('/transactions', entry({ amount: '0.20' })).expect(201);
    let overview = (await get('/overview' + period).expect(200))
      .body as FinanceOverview;
    assert.equal(overview.expenses, '0.30');
    assert.equal(overview.revenue, '1000.00');
    assert.equal(overview.net, '999.70');
    check('Exact decimal totals and invoice projection');
    await get('/transactions/' + expense.id, 'foreign').expect(404);
    const foreignLedger = (await get('/transactions', 'foreign').expect(200))
      .body as { total: number };
    assert.equal(foreignLedger.total, 0);
    check('Tenant-scoped detail and ledger');
    await assert.rejects(
      db.financialTransaction.update({
        where: { id: expense.id },
        data: { amount: '123.00' },
      }),
    );
    check('Database immutable amount trigger');
    await post(
      '/transactions',
      entry({
        type: 'ADJUSTMENT',
        effect: 'EXPENSE',
        amount: '-0.05',
        correctionOfId: expense.id,
        loadId: load.id,
        memo: 'Fictional correction',
      }),
    ).expect(201);
    assert.equal(
      (
        await db.financialTransaction.findUniqueOrThrow({
          where: { id: expense.id },
        })
      ).amount.toFixed(2),
      '0.10',
    );
    check('Append-only correction retains original');
    const payment = entry({
      type: 'PAYMENT',
      category: 'Customer Payment',
      loadId: load.id,
      amount: '400.00',
    });
    await Promise.all([
      post('/transactions', payment).expect(201),
      post('/transactions', payment).expect(201),
    ]);
    assert.equal(
      await db.loadPayment.count({ where: { organizationId: org } }),
      1,
    );
    overview = (await get('/overview' + period).expect(200))
      .body as FinanceOverview;
    assert.equal(overview.revenue, '1000.00');
    assert.equal(overview.collected, '400.00');
    assert.equal(overview.outstanding, '600.00');
    await post(
      '/transactions',
      entry({ type: 'PAYMENT', loadId: load.id, amount: '601.00' }),
    ).expect(400);
    check(
      'Concurrent payment idempotency, no double revenue and overpayment prevention',
    );
    await post(
      '/transactions',
      entry({
        type: 'DRIVER_PAY',
        driverId: driver.id,
        amount: '50.00',
        category: 'Driver Pay',
      }),
    ).expect(201);
    const payroll = (await get('/payroll' + period).expect(200)).body as {
      preparedPay: string;
    };
    assert.equal(payroll.preparedPay, '50.00');
    await get('/payroll/export' + period)
      .expect('Content-Type', /text\/csv/)
      .expect(200);
    check('Driver pay preparation and export');
    const csv =
      'Trip #,Customer,Delivered,Gross,Diesel,Invoice,Payment Status,Payment Date\nHIST-1,Fictional Broker,2026-09-15,3450.00,612.44,HIST-INV,PAID,2026-09-20\nHIST-2,Fictional Broker,2026-09-16,100.00,10.00,HIST-INV2,,\nBAD,Fictional Broker,2026-02-30,100.00,1.00,BAD-INV,UNPAID,\nHIST-1,Fictional Broker,2026-09-15,3450.00,612.44,HIST-INV,PAID,2026-09-20';
    const upload = () =>
      request(server)
        .post('/api/v1/finance/imports')
        .auth('owner', { type: 'bearer' })
        .attach('file', Buffer.from(csv), 'fictional.csv');
    const batch = (await upload().expect(201)).body as ImportBatch;
    assert.equal(
      await db.historicalLoadRecord.count({ where: { organizationId: org } }),
      0,
    );
    await get('/imports/' + batch.id, 'foreign').expect(404);
    await get('/imports/' + batch.id + '/source', 'foreign').expect(404);
    await post(
      '/imports/' + batch.id + '/confirm',
      { revision: 1, acceptWarnings: true, skipInvalidRows: true },
      'office',
    ).expect(403);
    assert.equal(
      ((await upload().expect(201)).body as ImportBatch).id,
      batch.id,
    );
    check(
      'Upload has no financial side effects, hash duplicates and private source',
    );
    const mapping = {
      loadNumber: 'Trip #',
      brokerName: 'Customer',
      deliveryDate: 'Delivered',
      grossRevenue: 'Gross',
      fuelExpense: 'Diesel',
      invoiceNumber: 'Invoice',
      paymentStatus: 'Payment Status',
      paymentDate: 'Payment Date',
    };
    const preview = (
      await post('/imports/' + batch.id + '/preview', {
        mapping,
        revision: 0,
      }).expect(201)
    ).body as ImportBatch;
    assert.deepEqual(preview.counts, {
      total: 4,
      VALID: 1,
      WARNING: 1,
      INVALID: 1,
      DUPLICATE: 1,
      imported: 0,
    });
    await post('/imports/' + batch.id + '/confirm', {
      revision: preview.revision,
      acceptWarnings: false,
      skipInvalidRows: true,
    }).expect(400);
    await post('/imports/' + batch.id + '/confirm', {
      revision: preview.revision,
      acceptWarnings: true,
      skipInvalidRows: false,
    }).expect(400);
    await post('/imports/' + batch.id + '/confirm', {
      revision: 999,
      acceptWarnings: true,
      skipInvalidRows: true,
    }).expect(409);
    check(
      'Preview classification, explicit acknowledgment and stale revision protection',
    );
    const confirm = {
      revision: preview.revision,
      acceptWarnings: true,
      skipInvalidRows: true,
    };
    await Promise.all([
      post('/imports/' + batch.id + '/confirm', confirm).expect(201),
      post('/imports/' + batch.id + '/confirm', confirm).expect(201),
    ]);
    assert.equal(
      await db.historicalLoadRecord.count({ where: { organizationId: org } }),
      2,
    );
    assert.equal(await db.load.count({ where: { organizationId: org } }), 1);
    assert.equal(
      await db.loadEvent.count({ where: { organizationId: org } }),
      1,
    );
    check(
      'Concurrent confirmation creates history once without fake live events',
    );
    overview = (await get('/overview' + period).expect(200))
      .body as FinanceOverview;
    assert.equal(overview.revenue, '4550.00');
    assert.equal(overview.expenses, '672.69');
    assert.equal(overview.net, '3877.31');
    assert.equal(overview.collected, '3850.00');
    assert.equal(overview.outstanding, '700.00');
    check(
      'Imported fuel affects costs, paid flag affects receipts only, unknown payment stays outstanding',
    );
    const imported = (
      await get('/transactions?source=IMPORT&pageSize=100').expect(200)
    ).body as { items: FinanceTransaction[]; total: number };
    assert.equal(imported.total, 5);
    assert.equal(
      imported.items.find((r) => r.category === 'Fuel')?.sourceColumn,
      'Diesel',
    );
    assert.ok(
      imported.items.every(
        (r) => r.importBatchId === batch.id && r.importRowNumber,
      ),
    );
    await get('/imports/' + batch.id + '/source').expect(200);
    check('Original bytes, rows, columns and source filters');
    await assert.rejects(
      db.load.create({
        data: {
          organizationId: org,
          loadNumber: 'hist-1',
          brokerName: 'Duplicate',
          totalRate: '1.00',
        },
      }),
    );
    check('Live load cannot duplicate historical revenue');
    const detail = (await get('/loads/' + load.id).expect(200)).body as {
      expenses: string;
    };
    assert.equal(detail.expenses, '0.05');
    await get('/profitability' + period).expect(200);
    const audit = (
      await get('/audit?from=1900-01-01&to=9999-12-31').expect(200)
    ).body as { action: string }[];
    assert.ok(audit.some((a) => a.action === 'PAYMENT_RECEIVED'));
    assert.ok(audit.some((a) => a.action === 'IMPORT_CONFIRMED'));
    check('Load summary, profitability and combined audit SQL');
    await post(
      '/transactions',
      entry({ description: '=HYPERLINK("bad")' }),
    ).expect(201);
    const exported = await get('/export' + period).expect(200);
    assert.match(exported.text, /'=HYPERLINK/);
    check('Authenticated export neutralizes spreadsheet formulas');
    await post('/imports/' + batch.id + '/reverse', {
      reason: 'Fictional reversal test',
    }).expect(201);
    await post('/imports/' + batch.id + '/reverse', {
      reason: 'Idempotent repeat',
    }).expect(201);
    assert.equal(
      await db.financialTransaction.count({
        where: { organizationId: org, source: 'IMPORT', status: 'POSTED' },
      }),
      0,
    );
    assert.equal(
      await db.financialImportRow.count({ where: { organizationId: org } }),
      4,
    );
    overview = (await get('/overview' + period).expect(200))
      .body as FinanceOverview;
    assert.equal(overview.revenue, '1000.00');
    check('Reversal excludes totals and preserves original staging evidence');
    console.log(`Finance database/HTTP gate: ${checks} scenarios PASS`);
  } finally {
    // Only tenants created by this run; no resets, migrations or shared fixture deletion.
    const where = { organizationId: { in: [org, other] } };
    await db.financialAuditEvent.deleteMany({ where });
    await db.financialTransaction.deleteMany({
      where: { ...where, type: 'ADJUSTMENT' },
    });
    await db.financialTransaction.deleteMany({ where });
    await db.historicalLoadRecord.deleteMany({ where });
    await db.financialImportRow.deleteMany({ where });
    await db.financialImportBatch.deleteMany({ where });
    await db.loadEvent.deleteMany({ where });
    await db.loadPayment.deleteMany({ where });
    await db.document.deleteMany({ where });
    await db.load.deleteMany({ where });
    await db.driver.deleteMany({ where });
    await db.user.deleteMany({ where });
    await db.organization.deleteMany({ where: { id: { in: [org, other] } } });
    if (app) await app.close();
    await db.$disconnect();
  }
}
void main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
