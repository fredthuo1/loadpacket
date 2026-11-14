import { driverActionToken } from '../src/loads/load-action-token';
// Explicit opt-in: verifies real PostgreSQL serialization using only a fresh isolated tenant.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { PrismaService } from '../src/database/prisma.service';
import { LoadEventsService } from '../src/load-events/load-events.service';
import { StopEventsService } from '../src/drivers/stop-events.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { DetentionService } from '../src/money-opportunities/detention.service';
import { MoneyOpportunitiesService } from '../src/money-opportunities/money-opportunities.service';
import { ExternalService } from '../src/external/external.service';
import { LocalDocumentStorage } from '../src/documents/document-storage';
async function main() {
  if (process.env.RUN_MOBILE_DATABASE_TESTS !== '1')
    throw new Error('Explicit database test opt-in required');
  const prisma = new PrismaService();
  const organizationId = randomUUID();
  let created = false;
  try {
    await prisma.$connect();
    await prisma.organization.create({
      data: { id: organizationId, name: 'D10 isolated stop integrity test' },
    });
    created = true;
    const account = await prisma.user.create({
      data: {
        organizationId,
        authUserId: randomUUID(),
        role: 'DRIVER',
        firstName: 'D10',
        lastName: 'Test',
        email: `${organizationId}@example.invalid`,
      },
    });
    const driver = await prisma.driver.create({
      data: {
        organizationId,
        userId: account.id,
        firstName: 'D10',
        lastName: 'Test',
        status: 'ACTIVE',
      },
    });
    const user: AuthenticatedUser = {
      ...account,
      driverId: driver.id,
      driverName: 'D10 Test',
    };
    const load = await prisma.load.create({
      data: {
        organizationId,
        loadNumber: 'D10-CONCURRENCY',
        brokerName: 'Isolated test',
        totalRate: '1000.00',
        status: 'IN_TRANSIT',
      },
    });
    await prisma.loadAssignment.create({
      data: {
        organizationId,
        loadId: load.id,
        driverId: driver.id,
        status: 'IN_PROGRESS',
      },
    });
    const pickup = await prisma.loadStop.create({
      data: {
        organizationId,
        loadId: load.id,
        sequence: 10,
        type: 'PICKUP',
        address: 'Test pickup',
      },
    });
    const delivery = await prisma.loadStop.create({
      data: {
        organizationId,
        loadId: load.id,
        sequence: 20,
        type: 'DELIVERY',
        address: 'Test delivery',
      },
    });
    const actionToken = await driverActionToken(
      prisma,
      organizationId,
      load.id,
      driver.id,
    );
    const service = new StopEventsService(
      prisma,
      new LoadEventsService(prisma),
    );
    await assert.rejects(
      service.record(user, load.id, delivery.id, 'arrive', { actionToken }),
    );
    for (const stop of [pickup, delivery])
      for (const action of ['arrive', 'depart'] as const) {
        const results = await Promise.all(
          Array.from({ length: 4 }, () =>
            service.record(user, load.id, stop.id, action, { actionToken }),
          ),
        );
        assert.equal(results.filter((result) => !result.duplicate).length, 1);
      }
    assert.equal(
      await prisma.loadEvent.count({
        where: { organizationId, loadId: load.id },
      }),
      4,
    );
    assert.equal(
      (await prisma.load.findUniqueOrThrow({ where: { id: load.id } })).status,
      'IN_TRANSIT',
    );
    const owner: AuthenticatedUser = { ...user, role: 'OWNER' };
    const events = new LoadEventsService(prisma);
    const detention = new DetentionService(prisma, events);
    const money = new MoneyOpportunitiesService(prisma, events, detention);
    await prisma.loadStop.update({
      where: { id: pickup.id },
      data: {
        arrivedAt: new Date(Date.now() - 190 * 60000),
        departedAt: new Date(),
      },
    });
    await detention.confirmTerms(owner, load.id, {
      freeMinutes: 120,
      hourlyRate: '150.00',
      basis: 'REG isolated controlled evidence',
    });
    const scans = await Promise.all(
      Array.from({ length: 4 }, () => money.scanLoad(owner, load.id)),
    );
    assert.equal(
      scans.reduce((sum, scan) => sum + scan.createdCount, 0),
      1,
    );
    assert.equal(
      await prisma.loadChargeOpportunity.count({
        where: { organizationId, type: 'DETENTION' },
      }),
      1,
    );
    const shares = new ExternalService(prisma, new LocalDocumentStorage());
    const links = await Promise.all(
      Array.from({ length: 4 }, () =>
        shares.create(owner, load.id, { permissions: ['VIEW_LOAD_SUMMARY'] }),
      ),
    );
    assert.equal(
      await prisma.externalTransactionAccess.count({
        where: { organizationId, revokedAt: null },
      }),
      1,
    );
    const outcomes = await Promise.allSettled(
      links.map((link) => shares.view(link.path.split('#')[1])),
    );
    assert.equal(
      outcomes.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    console.log(
      'Detention scan concurrency and broker regeneration concurrency: PASS',
    );
    console.log(
      'Stop ordering, real row-lock concurrency, timestamps and event uniqueness: PASS',
    );
  } finally {
    if (created) {
      await prisma.externalTransactionAccess.deleteMany({
        where: { organizationId },
      });
      await prisma.loadChargeOpportunity.deleteMany({
        where: { organizationId },
      });
      await prisma.agreementVersion.deleteMany({ where: { organizationId } });
      await prisma.agreement.deleteMany({ where: { organizationId } });
      await prisma.loadEvent.deleteMany({ where: { organizationId } });
      await prisma.loadAssignment.deleteMany({ where: { organizationId } });
      await prisma.loadStop.deleteMany({ where: { organizationId } });
      await prisma.load.deleteMany({ where: { organizationId } });
      await prisma.driver.deleteMany({ where: { organizationId } });
      await prisma.user.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await prisma.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Stop database integrity check failed; database details suppressed.',
  );
  process.exitCode = 1;
});
