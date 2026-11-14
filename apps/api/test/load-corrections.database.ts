import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
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
import { DocumentStorage } from '../src/documents/document-storage';
import { LoadEventsService } from '../src/load-events/load-events.service';
import { LoadManagementService } from '../src/loads/load-management.service';
import { DriversService } from '../src/drivers/drivers.service';
import { StopEventsService } from '../src/drivers/stop-events.service';
import { DriverDocumentCaptureService } from '../src/documents/driver-document-capture.service';
import { OwnerDashboardService } from '../src/loads/owner-dashboard.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';

async function main() {
  const db = new PrismaService();
  const orgs = [randomUUID(), randomUUID()];
  const results: string[] = [];
  let app: INestApplication | undefined;
  const pass = (name: string) => {
    results.push(name);
    console.log(`PASS ${name}`);
  };
  const events = new LoadEventsService(db);
  const management = new LoadManagementService(db, events);
  const drivers = new DriversService(db, events);
  const stops = new StopEventsService(db, events);
  let storageWrites = 0;
  const storage: DocumentStorage = {
    put: () => {
      storageWrites++;
      return Promise.resolve();
    },
    read: () =>
      Promise.reject(new Error('No stored content requested by this test')),
    removeUncommitted: () => Promise.resolve(),
  };
  const capture = new DriverDocumentCaptureService(db, events, storage);
  const conflict = async (op: Promise<unknown>) =>
    assert.rejects(
      op,
      (e: { getStatus?: () => number }) => e.getStatus?.() === 409,
    );
  try {
    await db.$connect();
    for (const id of orgs)
      await db.organization.create({
        data: { id, name: 'Fictional B1b Carrier' },
      });
    const user = async (
      role: 'OWNER' | 'DISPATCHER' | 'BACK_OFFICE' | 'DRIVER',
      organizationId = orgs[0],
    ): Promise<AuthenticatedUser> => {
      const row = await db.user.create({
        data: {
          organizationId,
          authUserId: randomUUID(),
          email: `${randomUUID()}@example.invalid`,
          firstName: 'Synthetic',
          lastName: role,
          role,
        },
      });
      return { ...row, driverId: null, driverName: null };
    };
    const owner = await user('OWNER'),
      dispatcher = await user('DISPATCHER'),
      backoffice = await user('BACK_OFFICE'),
      driverIdentity = await user('DRIVER'),
      foreign = await user('OWNER', orgs[1]);
    const driver = await db.driver.create({
      data: {
        organizationId: orgs[0],
        userId: driverIdentity.id,
        firstName: 'Synthetic',
        lastName: 'Driver',
      },
    });
    const driverUser = { ...driverIdentity, driverId: driver.id };
    const second = await db.driver.create({
      data: {
        organizationId: orgs[0],
        firstName: 'Second',
        lastName: 'Driver',
      },
    });
    const load = async () =>
      db.load.create({
        data: {
          organizationId: orgs[0],
          loadNumber: `B1b-${randomUUID()}`,
          brokerName: 'Fictional Broker',
          totalRate: '1234.56',
          stops: {
            create: [
              {
                organizationId: orgs[0],
                type: 'PICKUP',
                sequence: 1,
                facilityName: 'Original pickup',
                address: '1 Synthetic Road',
              },
              {
                organizationId: orgs[0],
                type: 'DELIVERY',
                sequence: 2,
                facilityName: 'Original delivery',
                address: '2 Synthetic Road',
              },
            ],
          },
        },
      });
    const command = async (loadId: string) => ({
      expectedToken: (await management.detail(owner, loadId)).token,
      idempotencyKey: randomUUID(),
      reason: 'Synthetic correction reason',
    });
    const assign = async (loadId: string, driverId = driver.id) =>
      management.execute(owner, loadId, 'assign', {
        ...(await command(loadId)),
        driverId,
      });
    const token = async (loadId: string) =>
      (await drivers.findAssignedLoad(driverUser, driver.id, loadId))
        .actionToken;

    const correction = await load();
    const c = {
      ...(await command(correction.id)),
      equipment: 'Reefer',
      paymentTermsDays: 0,
      pickup: { appointmentText: 'Tomorrow at 09:00' },
      totalRate: '1500.25',
    };
    await management.execute(dispatcher, correction.id, 'correct', c);
    let stored = await db.load.findUniqueOrThrow({
      where: { id: correction.id },
      include: { stops: true, events: true },
    });
    assert.equal(stored.totalRate.toFixed(2), '1500.25');
    assert.equal(stored.paymentTermsDays, 0);
    assert.equal(
      stored.stops.find((stop) => stop.type === 'PICKUP')?.appointmentText,
      'Tomorrow at 09:00',
    );
    assert.equal(stored.events[0].actorId, dispatcher.id);
    const evidence = stored.events[0].metadata as {
      schemaVersion: number;
      before: { totalRate: string };
      after: { totalRate: string };
    };
    assert.equal(evidence.schemaVersion, 1);
    assert.equal(evidence.before.totalRate, '1234.56');
    assert.equal(evidence.after.totalRate, '1500.25');
    pass(
      'Dispatcher correction, Decimal precision, zero terms and versioned before/after audit',
    );

    const duplicate = await load();
    const cancel = await command(duplicate.id);
    const repeated = await Promise.all([
      management.execute(owner, duplicate.id, 'cancel', cancel),
      management.execute(owner, duplicate.id, 'cancel', cancel),
    ]);
    assert.deepEqual(repeated[0], repeated[1]);
    assert.equal(
      await db.loadEvent.count({
        where: { loadId: duplicate.id, type: 'LOAD_CANCELLED' },
      }),
      1,
    );
    await conflict(
      management.execute(owner, duplicate.id, 'cancel', {
        ...cancel,
        reason: 'Changed retry reason',
      }),
    );
    pass(
      'Concurrent exact cancellation retries return one result/event; conflicting retry rejected',
    );

    const historyLoad = await load();
    await assign(historyLoad.id);
    const oldToken = await token(historyLoad.id);
    await drivers.acceptLoad(driverUser, driver.id, historyLoad.id, oldToken);
    await conflict(
      management.execute(owner, historyLoad.id, 'correct', {
        ...(await command(historyLoad.id)),
        equipment: 'Changed after acceptance',
      }),
    );
    const unassign = await command(historyLoad.id);
    await management.execute(owner, historyLoad.id, 'unassign', unassign);
    await management.execute(owner, historyLoad.id, 'unassign', unassign);
    await assign(historyLoad.id);
    const newToken = await token(historyLoad.id);
    assert.notEqual(newToken, oldToken);
    const history = await drivers.assignmentHistory(driverUser, driver.id);
    assert.equal(history.filter((h) => h.loadId === historyLoad.id).length, 1);
    assert(history.find((h) => h.loadId === historyLoad.id)?.acceptedAt);
    assert(!JSON.stringify(history).includes('totalRate'));
    assert(!JSON.stringify(history).includes('reason'));
    await conflict(
      drivers.acceptLoad(driverUser, driver.id, historyLoad.id, oldToken),
    );
    await conflict(drivers.acceptLoad(driverUser, driver.id, historyLoad.id));
    await drivers.acceptLoad(driverUser, driver.id, historyLoad.id, newToken);
    await conflict(
      drivers.startLoad(driverUser, driver.id, historyLoad.id, oldToken),
    );
    await drivers.startLoad(driverUser, driver.id, historyLoad.id, newToken);
    await conflict(
      drivers.completeLoad(driverUser, driver.id, historyLoad.id, oldToken),
    );
    const stop = await db.loadStop.findFirstOrThrow({
      where: { loadId: historyLoad.id, type: 'PICKUP' },
    });
    await conflict(
      stops.record(driverUser, historyLoad.id, stop.id, 'arrive', {
        actionToken: oldToken,
      }),
    );
    await conflict(
      capture.capture(
        driverUser,
        driver.id,
        historyLoad.id,
        'BOL',
        {
          buffer: Buffer.from('%PDF-1.7 synthetic'),
          mimetype: 'application/pdf',
          originalname: 'synthetic.pdf',
        } as Express.Multer.File,
        oldToken,
      ),
    );
    assert.equal(storageWrites, 0);
    await stops.record(driverUser, historyLoad.id, stop.id, 'arrive', {
      actionToken: newToken,
    });
    pass(
      'Unassignment retains acceptance; same-Driver reassignment rejects old/missing tokens for accept/start/complete/stop/upload',
    );

    for (const race of [
      'edit-accept',
      'cancel-start',
      'unassign-reassign',
    ] as const) {
      for (let iteration = 0; iteration < 3; iteration++) {
        const row = await load();
        await assign(row.id);
        const actionToken = await token(row.id);
        if (race === 'cancel-start')
          await drivers.acceptLoad(driverUser, driver.id, row.id, actionToken);
        const dto = await command(row.id);
        const operations =
          race === 'edit-accept'
            ? [
                () =>
                  management.execute(owner, row.id, 'correct', {
                    ...dto,
                    equipment: 'Race correction',
                  }),
                () =>
                  drivers.acceptLoad(
                    driverUser,
                    driver.id,
                    row.id,
                    actionToken,
                  ),
              ]
            : race === 'cancel-start'
              ? [
                  () => management.execute(owner, row.id, 'cancel', dto),
                  () =>
                    drivers.startLoad(
                      driverUser,
                      driver.id,
                      row.id,
                      actionToken,
                    ),
                ]
              : [
                  () => management.execute(owner, row.id, 'unassign', dto),
                  () =>
                    management.execute(owner, row.id, 'assign', {
                      ...dto,
                      idempotencyKey: randomUUID(),
                      driverId: second.id,
                    }),
                ];
        if (iteration % 2) operations.reverse();
        const outcomes = await Promise.allSettled(operations.map((op) => op()));
        assert.equal(
          outcomes.filter((r) => r.status === 'fulfilled').length,
          1,
          JSON.stringify(outcomes),
        );
        const rejected = outcomes.find(
          (r) => r.status === 'rejected',
        ) as PromiseRejectedResult;
        assert.equal(
          (rejected.reason as { getStatus: () => number }).getStatus(),
          409,
        );
      }
      pass(`Real PostgreSQL race: ${race}, three iterations, one winner`);
    }

    for (let iteration = 0; iteration < 3; iteration++) {
      const row = await load();
      await assign(row.id);
      const oldActionToken = await token(row.id);
      const dto = await command(row.id);
      const ops = [
        () =>
          management.execute(owner, row.id, 'assign', {
            ...dto,
            driverId: driver.id,
          }),
        () => drivers.acceptLoad(driverUser, driver.id, row.id, oldActionToken),
      ];
      if (iteration % 2) ops.reverse();
      const outcomes = await Promise.allSettled(ops.map((op) => op()));
      assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
    }
    pass(
      'Real PostgreSQL race: same-Driver reassignment versus stale acceptance, three iterations',
    );
    const completed = await load();
    await assign(completed.id);
    await db.load.update({
      where: { id: completed.id },
      data: { status: 'DELIVERED' },
    });
    await db.loadAssignment.updateMany({
      where: { loadId: completed.id },
      data: {
        status: 'COMPLETED',
        acceptedAt: new Date(),
        completedAt: new Date(),
      },
    });
    const completedBefore = await db.loadAssignment.findFirst({
      where: { loadId: completed.id },
    });
    await conflict(
      management.execute(
        owner,
        completed.id,
        'unassign',
        await command(completed.id),
      ),
    );
    assert.deepEqual(
      await db.loadAssignment.findFirst({ where: { loadId: completed.id } }),
      completedBefore,
    );
    assert(
      (await drivers.findAssignedLoads(driverUser, driver.id)).loads.some(
        (item) =>
          item.load.id === completed.id &&
          item.assignment.status === 'COMPLETED',
      ),
    );
    pass(
      'Completed assignment and timestamps retained in Driver history after rejected management',
    );

    const reassigned = await load();
    await assign(reassigned.id);
    const beforeToken = await token(reassigned.id);
    await drivers.acceptLoad(driverUser, driver.id, reassigned.id, beforeToken);
    await assign(reassigned.id, second.id);
    assert(
      (await drivers.assignmentHistory(driverUser, driver.id)).some(
        (h) =>
          h.loadId === reassigned.id &&
          h.outcome === 'REASSIGNED' &&
          h.acceptedAt,
      ),
    );
    await assert.rejects(
      drivers.startLoad(driverUser, driver.id, reassigned.id, beforeToken),
      (error: { getStatus?: () => number }) => error.getStatus?.() === 404,
    );
    pass(
      'Direct reassignment snapshots outgoing acceptance and revokes former Driver access',
    );

    for (const status of [
      'IN_TRANSIT',
      'DELIVERED',
      'PAYMENT_READY',
      'INVOICED',
      'PAID',
    ] as const) {
      const row = await load();
      await db.load.update({ where: { id: row.id }, data: { status } });
      for (const action of ['correct', 'unassign', 'cancel'] as const)
        await conflict(
          management.execute(owner, row.id, action, {
            ...(await command(row.id)),
            equipment: 'Blocked',
          }),
        );
    }
    pass(
      'All execution/delivery/billing/paid states reject ordinary management',
    );

    const frozen = await load();
    const doc = await db.document.create({
      data: {
        organizationId: orgs[0],
        type: 'CARRIER_INVOICE',
        status: 'CONFIRMED',
        versions: {
          create: {
            organizationId: orgs[0],
            versionNumber: 1,
            originalFileName: 'immutable.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 12,
            checksum: 'synthetic-unchanged-checksum',
            storageKey: `synthetic/${randomUUID()}`,
          },
        },
      },
    });
    await db.loadDocument.create({
      data: {
        organizationId: orgs[0],
        loadId: frozen.id,
        documentId: doc.id,
        role: 'CARRIER_INVOICE',
      },
    });
    const beforeDocument = await db.documentVersion.findMany({
      where: { documentId: doc.id },
    });
    await conflict(
      management.execute(owner, frozen.id, 'correct', {
        ...(await command(frozen.id)),
        totalRate: '1.00',
      }),
    );
    await conflict(
      management.execute(owner, frozen.id, 'cancel', await command(frozen.id)),
    );
    assert.deepEqual(
      await db.documentVersion.findMany({ where: { documentId: doc.id } }),
      beforeDocument,
    );
    for (const kind of [
      'invoice',
      'payment',
      'approvedCharge',
      'postedFinance',
    ] as const) {
      const row = await load();
      if (kind === 'invoice')
        await db.load.update({
          where: { id: row.id },
          data: {
            invoiceIssuedAt: new Date(),
            paymentTermsDays: 45,
            amountPaid: '0.00',
          },
        });
      if (kind === 'payment')
        await db.loadPayment.create({
          data: {
            organizationId: orgs[0],
            loadId: row.id,
            amount: '10.25',
            currency: 'USD',
            idempotencyKey: randomUUID(),
            recordedAt: new Date(),
            recordedByUserId: owner.id,
          },
        });
      if (kind === 'approvedCharge')
        await db.loadChargeOpportunity.create({
          data: {
            organizationId: orgs[0],
            loadId: row.id,
            type: 'OTHER',
            status: 'APPROVED',
            amount: '12.00',
          },
        });
      if (kind === 'postedFinance')
        await db.financialTransaction.create({
          data: {
            organizationId: orgs[0],
            loadId: row.id,
            createdById: owner.id,
            type: 'INCOME',
            effect: 'INCOME',
            category: 'synthetic',
            amount: '12.34',
            transactionDate: new Date(),
            description: 'Synthetic financial record',
            idempotencyKey: randomUUID(),
          },
        });
      const before = await db.load.findUnique({
        where: { id: row.id },
        include: {
          payments: true,
          financialTransactions: true,
          chargeOpportunities: true,
        },
      });
      await conflict(
        management.execute(owner, row.id, 'correct', {
          ...(await command(row.id)),
          totalRate: '1.00',
        }),
      );
      await conflict(
        management.execute(owner, row.id, 'cancel', await command(row.id)),
      );
      assert.deepEqual(
        await db.load.findUnique({
          where: { id: row.id },
          include: {
            payments: true,
            financialTransactions: true,
            chargeOpportunities: true,
          },
        }),
        before,
      );
    }
    pass(
      'BOOKED inconsistencies fail closed for issued invoice/document/payment/approved charge/posted Finance; evidence unchanged',
    );

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(DocumentStorage)
      .useValue(storage)
      .overrideProvider(TokenVerifier)
      .useValue({
        verify: (value: string) => {
          const u = {
            owner,
            dispatcher,
            backoffice,
            driver: driverUser,
            foreign,
          }[value];
          if (!u) throw new UnauthorizedException();
          return Promise.resolve({ sub: u.authUserId });
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
    const server = app.getHttpServer() as Server;
    const httpLoad = await load();
    const post = (suffix: string, body: object, who = 'owner') =>
      request(server)
        .post(`/api/v1/loads/${httpLoad.id}/${suffix}`)
        .auth(who, { type: 'bearer' })
        .send(body);
    const dto = await command(httpLoad.id);
    for (const extra of [
      { organizationId: orgs[1] },
      { status: 'PAID' },
      { pickup: { organizationId: orgs[1] } },
      { reason: ' ' },
      { paymentTermsDays: null },
      { paymentTermsDays: 366 },
      { paymentTermsDays: -1 },
    ])
      await post('correct', { ...dto, ...extra }).expect(400);
    for (const who of ['driver', 'backoffice'])
      await post('cancel', dto, who).expect(403);
    await post('cancel', dto, 'foreign').expect(404);
    await post(
      'correct',
      { ...dto, equipment: 'HTTP corrected', paymentTermsDays: 365 },
      'dispatcher',
    ).expect(200);
    await post('cancel', { ...dto, idempotencyKey: randomUUID() }).expect(409);
    pass(
      'HTTP allowlist/nested validation/term boundaries, roles/tenant denial and stale state',
    );
    await assign(httpLoad.id);
    const t = await token(httpLoad.id);
    await request(server)
      .post(`/api/v1/me/loads/${httpLoad.id}/accept`)
      .auth('driver', { type: 'bearer' })
      .send({})
      .expect(409);
    await request(server)
      .post(`/api/v1/me/loads/${httpLoad.id}/accept`)
      .auth('driver', { type: 'bearer' })
      .send({ actionToken: t })
      .expect(200);
    await request(server)
      .post(`/api/v1/me/loads/${httpLoad.id}/accept`)
      .auth('driver', { type: 'bearer' })
      .send({ actionToken: t })
      .expect(200);
    await post('cancel', await command(httpLoad.id)).expect(200);
    await request(server)
      .post(`/api/v1/me/loads/${httpLoad.id}/start`)
      .auth('driver', { type: 'bearer' })
      .send({ actionToken: t })
      .expect(409);
    const list = await request(server)
      .get('/api/v1/me/loads')
      .auth('driver', { type: 'bearer' })
      .expect(200);
    assert(
      !(list.body as { loads: { load: { id: string } }[] }).loads.some(
        (l) => l.load.id === httpLoad.id,
      ),
    );
    const overview = await app
      .get(OwnerDashboardService)
      .getLoadOverview(owner, httpLoad.id);
    assert.equal(overview.load.status, 'CANCELLED');
    assert.equal(overview.driver, null);
    pass(
      'HTTP old-client rejection, valid/repeated acceptance, cancelled Driver action denial and Owner/Driver projection consistency',
    );
    stored = await db.load.findUniqueOrThrow({
      where: { id: correction.id },
      include: { stops: true, events: true },
    });
    assert.equal(stored.events.length, 1);
  } finally {
    if (app) await app.close();
    const where = { organizationId: { in: orgs } };
    await db.financialTransaction.deleteMany({ where });
    await db.loadPayment.deleteMany({ where });
    await db.loadChargeOpportunity.deleteMany({ where });
    await db.loadDocument.deleteMany({ where });
    await db.loadRequirement.deleteMany({ where });
    await db.loadEvent.deleteMany({ where });
    await db.loadAssignment.deleteMany({ where });
    await db.loadStop.deleteMany({ where });
    await db.documentVersion.deleteMany({ where });
    await db.document.deleteMany({ where });
    await db.load.deleteMany({ where });
    await db.driver.deleteMany({ where });
    await db.user.deleteMany({ where });
    await db.organization.deleteMany({ where: { id: { in: orgs } } });
    assert.equal(
      await db.organization.count({ where: { id: { in: orgs } } }),
      0,
    );
    await db.$disconnect();
    await writeFile(
      'results.json',
      JSON.stringify(
        { results, syntheticCleanup: true, storageWrites },
        null,
        2,
      ),
    );
    console.log('Synthetic tenant cleanup: PASS');
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
