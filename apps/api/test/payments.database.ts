import { DetentionService } from '../src/money-opportunities/detention.service';
// Opt-in integrity test. Creates and removes only a fresh, isolated tenant.
// No Supabase Auth provider calls, messages, or production identity changes.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { PrismaService } from '../src/database/prisma.service';
import { LoadEventsService } from '../src/load-events/load-events.service';
import { BillingSubmissionService } from '../src/loads/billing-submission.service';
import { AccountsReceivableService } from '../src/loads/accounts-receivable.service';
import { MoneyOpportunitiesService } from '../src/money-opportunities/money-opportunities.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
let stage = 'authorization';
async function main() {
  if (process.env.RUN_DAY7_DATABASE_TESTS !== '1')
    throw new Error('Opt-in required');
  const prisma = new PrismaService();
  const organizationId = randomUUID();
  let created = false;
  try {
    await prisma.$connect();
    stage = 'isolated fixtures';
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: 'D7 isolated financial integrity test',
      },
    });
    created = true;
    const account = await prisma.user.create({
      data: {
        organizationId,
        authUserId: randomUUID(),
        role: 'OWNER',
        firstName: 'D7',
        lastName: 'Integrity',
        email: 'integrity@example.invalid',
      },
    });
    const user: AuthenticatedUser = {
      ...account,
      driverId: null,
      driverName: null,
    };
    const load = await prisma.load.create({
      data: {
        organizationId,
        loadNumber: 'D7-CONCURRENCY',
        brokerName: 'Isolated Test',
        totalRate: '3250.00',
        status: 'PAYMENT_READY',
        invoiceNumber: 'D7-TEST-INVOICE',
        invoiceIssuedAt: new Date(),
      },
    });
    const document = await prisma.document.create({
      data: { organizationId, type: 'CARRIER_INVOICE', status: 'CONFIRMED' },
    });
    await prisma.loadDocument.create({
      data: {
        organizationId,
        loadId: load.id,
        documentId: document.id,
        role: 'CARRIER_INVOICE',
      },
    });
    await prisma.loadRequirement.create({
      data: {
        organizationId,
        loadId: load.id,
        documentType: 'CARRIER_INVOICE',
        requirement: 'REQUIRED',
        status: 'ACCEPTED',
      },
    });
    const events = new LoadEventsService(prisma);
    const billing = new BillingSubmissionService(prisma, events);
    const payments = new AccountsReceivableService(prisma, events);
    stage = 'concurrent billing';
    const submitted = await Promise.all([
      billing.submit(user, load.id, {
        recipientName: 'Test',
        paymentTermsDays: 30,
      }),
      billing.submit(user, load.id, {
        recipientName: 'Test',
        paymentTermsDays: 30,
      }),
    ]);
    assert.equal(submitted.filter((row) => row.submitted).length, 1);
    assert.equal(
      await prisma.loadEvent.count({
        where: { organizationId, loadId: load.id, type: 'BILLING_SUBMITTED' },
      }),
      1,
    );
    stage = 'concurrent independent payments';
    await Promise.all([
      payments.markPaid(user, load.id, {
        amountPaid: '1000.00',
        idempotencyKey: randomUUID(),
      }),
      payments.markPaid(user, load.id, {
        amountPaid: '1500.00',
        idempotencyKey: randomUUID(),
      }),
    ]);
    let stored = await prisma.load.findFirstOrThrow({
      where: { id: load.id, organizationId },
    });
    assert.equal(stored.amountPaid?.toFixed(2), '2500.00');
    assert.equal(stored.status, 'INVOICED');
    assert.equal(stored.paidAt, null);
    stage = 'concurrent duplicate final payment';
    const operation = { amountPaid: '750.00', idempotencyKey: randomUUID() };
    const settled = await Promise.all([
      payments.markPaid(user, load.id, operation),
      payments.markPaid(user, load.id, operation),
    ]);
    assert.equal(settled.filter((row) => row.recorded).length, 1);
    stored = await prisma.load.findFirstOrThrow({
      where: { id: load.id, organizationId },
    });
    assert.equal(stored.amountPaid?.toFixed(2), '3250.00');
    assert.equal(stored.status, 'PAID');
    assert.ok(stored.paidAt);
    assert.equal(
      await prisma.loadPayment.count({
        where: { organizationId, loadId: load.id },
      }),
      3,
    );
    assert.equal(
      await prisma.loadEvent.count({
        where: { organizationId, loadId: load.id, type: 'PAYMENT_RECEIVED' },
      }),
      3,
    );
    stage = 'concurrent overpayment prevention';
    const second = await prisma.load.create({
      data: {
        organizationId,
        loadNumber: 'D7-OVERPAYMENT',
        brokerName: 'Isolated Test',
        totalRate: '100.00',
        status: 'INVOICED',
        invoiceNumber: 'D7-SECOND',
        invoiceIssuedAt: new Date(),
      },
    });
    const competing = await Promise.allSettled([
      payments.markPaid(user, second.id, {
        amountPaid: '75.00',
        idempotencyKey: randomUUID(),
      }),
      payments.markPaid(user, second.id, {
        amountPaid: '75.00',
        idempotencyKey: randomUUID(),
      }),
    ]);
    assert.equal(
      competing.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    const secondBalance = await prisma.load.findFirstOrThrow({
      where: { id: second.id, organizationId },
    });
    assert.equal(secondBalance.amountPaid?.toFixed(2), '75.00');
    assert.equal(
      await prisma.loadPayment.count({
        where: { organizationId, loadId: second.id },
      }),
      1,
    );
    assert.equal(
      await prisma.loadEvent.count({
        where: { organizationId, loadId: second.id, type: 'PAYMENT_RECEIVED' },
      }),
      1,
    );
    stage = 'concurrent opportunity decisions';
    const opportunities = new MoneyOpportunitiesService(
      prisma,
      events,
      new DetentionService(prisma, events),
    );
    const opportunity = await prisma.loadChargeOpportunity.create({
      data: {
        organizationId,
        loadId: second.id,
        type: 'LUMPER_REIMBURSEMENT',
        amount: '50.00',
        description: 'Isolated approval race',
      },
    });
    const approvals = await Promise.all([
      opportunities.approve(user, opportunity.id),
      opportunities.approve(user, opportunity.id),
    ]);
    assert.equal(approvals.filter((result) => result.approved).length, 1);
    assert.equal(
      await prisma.loadEvent.count({
        where: {
          organizationId,
          loadId: second.id,
          type: 'CHARGE_OPPORTUNITY_APPROVED',
        },
      }),
      1,
    );
    await assert.rejects(
      opportunities.setAmount(user, opportunity.id, { amount: '999.00' }),
    );
    const immutable = await prisma.loadChargeOpportunity.findFirstOrThrow({
      where: { id: opportunity.id, organizationId },
    });
    assert.equal(immutable.amount?.toFixed(2), '50.00');
    const competingOpportunity = await prisma.loadChargeOpportunity.create({
      data: {
        organizationId,
        loadId: load.id,
        type: 'SCALE_REIMBURSEMENT',
        amount: '10.00',
        description: 'Isolated competing decisions',
      },
    });
    const decisions = await Promise.allSettled([
      opportunities.approve(user, competingOpportunity.id),
      opportunities.dismiss(user, competingOpportunity.id),
    ]);
    assert.equal(
      decisions.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      await prisma.loadEvent.count({
        where: {
          organizationId,
          loadId: load.id,
          type: {
            in: ['CHARGE_OPPORTUNITY_APPROVED', 'CHARGE_OPPORTUNITY_DISMISSED'],
          },
        },
      }),
      1,
    );
    console.log(
      'Real database: concurrent opportunity approval/dismissal and immutable approved amounts: PASS',
    );
    console.log(
      'Real database: concurrent billing, independent partial payments, duplicate final payment, exact ledger/event counts: PASS',
    );
  } finally {
    if (created) {
      await prisma.loadChargeOpportunity.deleteMany({
        where: { organizationId },
      });
      await prisma.loadPayment.deleteMany({ where: { organizationId } });
      await prisma.loadRequirement.deleteMany({ where: { organizationId } });
      await prisma.loadDocument.deleteMany({ where: { organizationId } });
      await prisma.loadEvent.deleteMany({ where: { organizationId } });
      await prisma.load.deleteMany({ where: { organizationId } });
      await prisma.document.deleteMany({ where: { organizationId } });
      await prisma.user.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({
        where: {
          id: organizationId,
          name: 'D7 isolated financial integrity test',
        },
      });
    }
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error(
    `Financial integrity check failed during ${stage}; database details suppressed.`,
  );
  process.exitCode = 1;
});
