import { LoadManagementService } from '../src/loads/load-management.service';
// Opt-in live database integrity verification: creates isolated test tenants only,
// exercises actual services/locks/constraints, then removes exactly those tenants.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { Prisma } from '../src/generated/prisma/client';
import { DriverManagementService } from '../src/drivers/driver-management.service';
import { LoadsService } from '../src/loads/loads.service';
import { LoadEventsService } from '../src/load-events/load-events.service';
import { DriversService } from '../src/drivers/drivers.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';

async function main() {
  if (process.env.RUN_DAY7A_DATABASE_TESTS !== '1')
    throw new Error(
      'Set RUN_DAY7A_DATABASE_TESTS=1 to authorize isolated test tenants.',
    );
  const prisma = new PrismaService();
  const organizations: string[] = [];
  try {
    await prisma.$connect();
    const management = new DriverManagementService(prisma);
    const events = new LoadEventsService(prisma);
    const loadManagement = new LoadManagementService(prisma, events);
    const loads = new LoadsService(prisma, events, loadManagement);
    const organizationId = randomUUID();
    await prisma.organization.create({
      data: { id: organizationId, name: 'D7A isolated integrity test' },
    });
    organizations.push(organizationId);
    const user: AuthenticatedUser = {
      id: randomUUID(),
      authUserId: randomUUID(),
      organizationId,
      role: 'OWNER',
      email: 'test@example.invalid',
      firstName: 'D7A',
      lastName: 'Test',
      driverId: null,
      driverName: null,
    };
    const driver = await management.create(user, {
      firstName: 'D7A',
      lastName: 'Test Driver',
      email: 'unique@example.invalid',
    });
    assert.equal(driver.accountConnected, false);
    const load = await prisma.load.create({
      data: {
        organizationId,
        loadNumber: 'D7A-LOCK-TEST',
        brokerName: 'D7A test',
        totalRate: new Prisma.Decimal('100.00'),
      },
    });
    const assigned = await Promise.allSettled([
      loads.assignDriver(user, load.id, {
        driverId: driver.id,
        idempotencyKey: randomUUID(),
        expectedToken: (
          await new LoadManagementService(prisma, events).detail(user, load.id)
        ).token,
        reason: 'Test assignment',
      }),
      management.setStatus(user, driver.id, 'INACTIVE'),
    ]);
    assert.equal(
      assigned.filter((result) => result.status === 'fulfilled').length,
      1,
      'Concurrent assign/deactivate must have exactly one winner',
    );
    const failed = assigned.find((result) => result.status === 'rejected');
    assert.ok(
      failed?.status === 'rejected' &&
        failed.reason instanceof ConflictException,
    );
    const stored = await prisma.driver.findFirstOrThrow({
      where: { id: driver.id, organizationId },
    });
    const assignment = await prisma.loadAssignment.findFirst({
      where: { organizationId, driverId: driver.id },
    });
    assert.ok(
      !(stored.status === 'INACTIVE' && assignment),
      'No inactive driver may receive the concurrent assignment',
    );
    console.log('Concurrent assignment/deactivation invariant: PASS');

    await management.setStatus(user, driver.id, 'ACTIVE');
    await loads.assignDriver(user, load.id, {
      driverId: driver.id,
      idempotencyKey: randomUUID(),
      expectedToken: (
        await new LoadManagementService(prisma, events).detail(user, load.id)
      ).token,
      reason: 'Test assignment',
    });
    await assert.rejects(
      management.setStatus(user, driver.id, 'INACTIVE'),
      ConflictException,
    );
    const workflow = new DriversService(prisma, new LoadEventsService(prisma));
    const actionToken = (
      await workflow.findAssignedLoad(user, driver.id, load.id)
    ).actionToken;
    await Promise.all([
      workflow.acceptLoad(user, driver.id, load.id, actionToken),
      workflow.acceptLoad(user, driver.id, load.id, actionToken),
    ]);
    await Promise.all([
      workflow.startLoad(user, driver.id, load.id, actionToken),
      workflow.startLoad(user, driver.id, load.id, actionToken),
    ]);
    await Promise.all([
      workflow.completeLoad(user, driver.id, load.id, actionToken),
      workflow.completeLoad(user, driver.id, load.id, actionToken),
    ]);
    for (const type of [
      'DRIVER_ACCEPTED',
      'LOAD_STARTED',
      'LOAD_COMPLETED',
    ] as const) {
      assert.equal(
        await prisma.loadEvent.count({
          where: { organizationId, loadId: load.id, type },
        }),
        1,
      );
    }
    console.log(
      'Concurrent acceptance/start/completion produce one event per transition: PASS',
    );
    await management.setStatus(user, driver.id, 'ACTIVE');
    await assert.rejects(
      prisma.driver.create({
        data: {
          organizationId,
          firstName: 'Duplicate',
          lastName: 'Test',
          email: ' UNIQUE@EXAMPLE.INVALID ',
        },
      }),
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002',
    );
    console.log(
      'Database case-insensitive trimmed active-email constraint: PASS',
    );
    await management.setStatus(user, driver.id, 'INACTIVE');
    const duplicate = await management.create(user, {
      firstName: 'D7A',
      lastName: 'Replacement',
      email: 'unique@example.invalid',
    });
    assert.ok(duplicate.id !== driver.id);
    await assert.rejects(
      management.setStatus(user, driver.id, 'ACTIVE'),
      ConflictException,
    );
    console.log(
      'Inactive history preserved and conflicting reactivation denied: PASS',
    );
    const detail = await management.detail(user, driver.id);
    assert.equal(detail.totalLoadCount, 1);
    console.log('Real Prisma profile/roster/history queries: PASS');
    assert.ok(
      (await management.list(user)).some((item) => item.id === driver.id),
    );
  } finally {
    // Only UUIDs created by this process can be removed. Never touch demo tenants.
    if (organizations.length) {
      await prisma.loadAssignment.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await prisma.driver.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await prisma.organization.deleteMany({
        where: {
          id: { in: organizations },
          name: 'D7A isolated integrity test',
        },
      });
    }
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'Day 7A database integrity test failed; sensitive database details suppressed.',
  );
  process.exitCode = 1;
});
