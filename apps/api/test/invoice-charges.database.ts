import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { PDFParse } from 'pdf-parse';
import { CanvasFactory } from 'pdf-parse/worker';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { invoiceDueDate } from '../src/loads/invoice-terms';
import { FinanceService } from '../src/finance/finance.service';
import { PrismaService } from '../src/database/prisma.service';
import { LoadEventsService } from '../src/load-events/load-events.service';
import { CarrierInvoiceService } from '../src/loads/carrier-invoice.service';
import { BillingSubmissionService } from '../src/loads/billing-submission.service';
import { BillingPacketService } from '../src/loads/billing-packet.service';
import { AccountsReceivableService } from '../src/loads/accounts-receivable.service';
import { MoneyOpportunitiesService } from '../src/money-opportunities/money-opportunities.service';
import { DetentionService } from '../src/money-opportunities/detention.service';
import type { DocumentStorage } from '../src/documents/document-storage';
import type { AuthenticatedUser } from '../src/auth/auth.types';

async function main() {
  const db = new PrismaService();
  const orgs = [randomUUID(), randomUUID()];
  const checks: string[] = [];
  const pass = (name: string) => {
    checks.push(name);
    console.log('PASS ' + name);
  };
  const files = new Map<string, Buffer>();
  const storage: DocumentStorage = {
    put: async (k, b) => {
      assert(!files.has(k));
      files.set(k, Buffer.from(b));
      await mkdir(dirname(resolve('evidence', k)), { recursive: true });
      await writeFile(resolve('evidence', k), b, { flag: 'wx' });
    },
    read: async (k) => files.get(k) ?? readFile(resolve('evidence', k)),
    removeUncommitted: (k) => {
      files.delete(k);
      return Promise.resolve();
    },
  };
  const events = new LoadEventsService(db),
    invoices = new CarrierInvoiceService(db, events, storage),
    ar = new AccountsReceivableService(db, events),
    billing = new BillingSubmissionService(db, events),
    packets = new BillingPacketService(db, storage);
  const opportunities = new MoneyOpportunitiesService(
    db,
    events,
    new DetentionService(db, events),
  );
  const text = async (bytes: Buffer) => {
    const parser = new PDFParse({ data: bytes, CanvasFactory });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  };
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
    const users: AuthenticatedUser[] = [];
    for (const [index, id] of orgs.entries()) {
      await db.organization.create({
        data: {
          id,
          name: `B1c Fictional Carrier ${index}`,
          defaultPaymentTermsDays: 45,
        },
      });
      users.push({
        ...(await db.user.create({
          data: {
            organizationId: id,
            authUserId: randomUUID(),
            firstName: 'Synthetic',
            lastName: 'Owner',
            email: `b1c-${randomUUID()}@example.invalid`,
            role: 'OWNER',
          },
        })),
        driverId: null,
        driverName: null,
      });
    }
    const user = users[0];
    const load = (u = user) =>
      db.load.create({
        data: {
          organizationId: u.organizationId,
          loadNumber: `B1C-${randomUUID()}`,
          brokerName: 'Fictional Broker',
          status: 'DELIVERED',
          linehaul: '1000',
          fuelSurcharge: '100',
          totalRate: '1100',
          requirements: {
            create: {
              organizationId: u.organizationId,
              documentType: 'CARRIER_INVOICE',
              requirement: 'REQUIRED',
              status: 'MISSING',
            },
          },
        },
      });
    const charge = async (loadId: string, amount = '25.25', approve = true) => {
      const c = await db.loadChargeOpportunity.create({
        data: {
          organizationId: user.organizationId,
          loadId,
          type: 'OTHER',
          amount,
          currency: 'USD',
          description: 'Synthetic reviewed fee',
          status: 'DETECTED',
        },
      });
      if (approve) await opportunities.approve(user, c.id);
      return c;
    };
    const issue = async (loadId: string, ids: string[], supplemental = false) =>
      invoices.generate(user, loadId, {
        chargeIds: ids,
        supplemental,
        expectedToken: (await invoices.preview(user, loadId)).expectedToken,
        idempotencyKey: randomUUID(),
      });
    const canonical = (loadId: string) =>
      db.carrierInvoice.findFirstOrThrow({
        where: { loadId, originalInvoiceId: null },
        include: { documentVersion: true },
      });
    const a = await load(),
      c = await charge(a.id),
      unapproved = await charge(a.id, '99', false),
      dismissed = await charge(a.id, '10', false);
    await opportunities.dismiss(user, dismissed.id);
    await assert.rejects(issue(a.id, [unapproved.id]), /approved/);
    await assert.rejects(issue(a.id, [dismissed.id]), /approved/);
    const zero = await charge(a.id, '0');
    await assert.rejects(issue(a.id, [zero.id]), /positive/);
    await issue(a.id, [c.id]);
    const original = await canonical(a.id);
    assert.equal(original.totalAmount.toFixed(2), '1125.25');
    assert.equal(original.paymentTermsDays, 45);
    const bytes = files.get(original.documentVersion.storageKey)!;
    const pdfText = await text(bytes);
    assert(
      pdfText.includes(c.id) &&
        pdfText.includes('25.25') &&
        pdfText.includes('1125.25'),
    );
    assert.equal(
      (
        await db.load.findUniqueOrThrow({ where: { id: a.id } })
      ).totalRate.toFixed(2),
      '1100.00',
    );
    await billing.submit(user, a.id, { recipientName: 'Fictional Broker' });
    assert(
      (await text((await packets.generate(user, a.id)).buffer)).includes(
        '1125.25',
      ),
    );
    assert.equal(
      (await ar.getDashboard(user)).invoices.find(
        (i) => i.invoiceId === original.id,
      )!.remainingBalance,
      '1125.25',
    );
    pass(
      'approved-only itemization, zero exclusion, frozen base rate, PDF/packet/A/R agreement',
    );
    await ar.markPaid(user, a.id, {
      invoiceId: original.id,
      amountPaid: '100',
      idempotencyKey: randomUUID(),
    });
    const receiptBefore = JSON.stringify(
      await db.loadPayment.findMany({ where: { loadId: a.id } }),
    );
    const extra = await charge(a.id, '70.05');
    await issue(a.id, [extra.id], true);
    const supplement = await db.carrierInvoice.findFirstOrThrow({
      where: { loadId: a.id, originalInvoiceId: original.id },
    });
    await invoices.submitSupplement(user, a.id, supplement.id);
    await invoices.submitSupplement(user, a.id, supplement.id);
    assert.equal(
      JSON.stringify(
        await db.loadPayment.findMany({ where: { loadId: a.id } }),
      ),
      receiptBefore,
    );
    assert.equal(
      createHash('sha256')
        .update(files.get(original.documentVersion.storageKey)!)
        .digest('hex'),
      original.documentVersion.checksum,
    );
    const dashboard = await ar.getDashboard(user);
    assert.equal(dashboard.summary.outstanding.amount, '1095.30');
    const revenue = await db.$queryRaw<
      { amount: string }[]
    >`SELECT sum(amount)::text amount FROM finance_records WHERE organization_id=${user.organizationId}::uuid AND load_id=${a.id}::uuid AND effect='INCOME'`;
    assert.equal(revenue[0].amount, '1195.30');
    const finance = new FinanceService(db, ar);
    assert.equal(
      (await finance.detail(user, `invoice:${supplement.id}`)).record.amount,
      '70.05',
    );
    await assert.rejects(
      finance.detail(users[1], `invoice:${supplement.id}`),
      /not found/,
    );
    assert.equal(
      (await finance.loadSummary(user, a.id)).grossRevenue,
      '1195.30',
    );
    await assert.rejects(
      ar.markPaid(user, a.id, {
        invoiceId: supplement.id,
        amountPaid: '70.06',
        idempotencyKey: randomUUID(),
      }),
      /exceeds/,
    );
    const paymentKey = randomUUID();
    await ar.markPaid(user, a.id, {
      invoiceId: supplement.id,
      amountPaid: '70.05',
      idempotencyKey: paymentKey,
    });
    await ar.markPaid(user, a.id, {
      invoiceId: supplement.id,
      amountPaid: '70.05',
      idempotencyKey: paymentKey,
    });
    await assert.rejects(
      ar.markPaid(user, a.id, {
        invoiceId: original.id,
        amountPaid: '70.05',
        idempotencyKey: paymentKey,
      }),
      /different payment/,
    );
    await ar.markPaid(user, a.id, {
      amountPaid: '1025.25',
      idempotencyKey: randomUUID(),
    });
    const paidLoad = await db.load.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(paidLoad.status, 'PAID');
    const paidExtra = await charge(a.id, '12');
    await issue(a.id, [paidExtra.id], true);
    const last = await db.carrierInvoice.findFirstOrThrow({
      where: {
        loadId: a.id,
        originalInvoiceId: original.id,
        submittedAt: null,
      },
    });
    await invoices.submitSupplement(user, a.id, last.id);
    assert.equal(
      (
        await db.load.findUniqueOrThrow({ where: { id: a.id } })
      ).paidAt!.toISOString(),
      paidLoad.paidAt!.toISOString(),
    );
    assert.equal(
      (await ar.getDashboard(user)).invoices.find(
        (i) => i.invoiceId === last.id,
      )!.remainingBalance,
      '12.00',
    );
    pass(
      'partial and fully paid originals preserve receipts/checksum; supplemental limits/retry; Finance revenue excludes payments',
    );
    const alloc = await db.carrierInvoiceCharge.findFirstOrThrow({
      where: { chargeOpportunityId: c.id },
    });
    await assert.rejects(
      db.carrierInvoiceCharge.update({
        where: { id: alloc.id },
        data: { amount: '1' },
      }),
      /immutable/,
    );
    await assert.rejects(
      db.carrierInvoiceCharge.delete({ where: { id: alloc.id } }),
      /immutable/,
    );
    await assert.rejects(
      db.carrierInvoice.update({
        where: { id: original.id },
        data: { totalAmount: '1' },
      }),
      /immutable/,
    );
    await assert.rejects(
      db.loadChargeOpportunity.update({
        where: { id: c.id },
        data: { status: 'DETECTED' },
      }),
      /immutable/,
    );
    await assert.rejects(
      opportunities.setAmount(user, c.id, { amount: '20' }),
      /Only detected/,
    );
    await assert.rejects(opportunities.dismiss(user, c.id), /cannot/);
    await assert.rejects(issue(a.id, [c.id], true), /approved/);
    const other = await load(),
      foreign = await load(users[1]);
    await assert.rejects(invoices.preview(user, foreign.id), /not found/);
    await assert.rejects(
      ar.markPaid(user, other.id, {
        invoiceId: original.id,
        amountPaid: '1',
        idempotencyKey: randomUUID(),
      }),
      /not found/,
    );
    await assert.rejects(
      db.loadPayment.create({
        data: {
          organizationId: users[1].organizationId,
          loadId: foreign.id,
          invoiceId: original.id,
          amount: '1',
          currency: 'USD',
          recordedAt: new Date(),
          idempotencyKey: randomUUID(),
        },
      }),
    );
    await assert.rejects(
      db.loadPayment.create({
        data: {
          organizationId: user.organizationId,
          loadId: other.id,
          invoiceId: original.id,
          amount: '1',
          currency: 'USD',
          recordedAt: new Date(),
          idempotencyKey: randomUUID(),
        },
      }),
    );
    const otherCharge = await charge(other.id);
    await assert.rejects(
      db.carrierInvoiceCharge.create({
        data: {
          organizationId: user.organizationId,
          loadId: other.id,
          invoiceId: original.id,
          chargeOpportunityId: otherCharge.id,
          amount: '25.25',
          currency: 'USD',
          description: 'invalid',
          snapshot: {},
        },
      }),
    );
    pass(
      'tenant/load-safe constraints, immutable invoice/allocation/opportunity evidence and billed reversal rejection',
    );

    for (let iteration = 0; iteration < 3; iteration++) {
      const race = await load();
      const r = await charge(race.id, '3', false);
      const preview = await invoices.preview(user, race.id);
      const result = await Promise.allSettled([
        opportunities.approve(user, r.id),
        invoices.generate(user, race.id, {
          chargeIds: [],
          expectedToken: preview.expectedToken,
          idempotencyKey: randomUUID(),
        }),
      ]);
      assert.equal(result[0].status, 'fulfilled');
      const produced = await db.carrierInvoice.findMany({
        where: { loadId: race.id },
      });
      assert(produced.length <= 1);
      assert(produced.every((i) => i.totalAmount.eq(1100)));
      const initial = await load();
      const ic = await charge(initial.id);
      const token = (await invoices.preview(user, initial.id)).expectedToken;
      const originals = await Promise.allSettled(
        [1, 2].map(() =>
          invoices.generate(user, initial.id, {
            chargeIds: [ic.id],
            expectedToken: token,
            idempotencyKey: randomUUID(),
          }),
        ),
      );
      assert.equal(originals.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(
        await db.carrierInvoice.count({ where: { loadId: initial.id } }),
        1,
      );
      await billing.submit(user, initial.id, {
        recipientName: 'Fictional Broker',
      });
      const sc = await charge(initial.id, '5');
      const st = (await invoices.preview(user, initial.id)).expectedToken;
      const payload = {
        supplemental: true,
        chargeIds: [sc.id],
        expectedToken: st,
        idempotencyKey: randomUUID(),
      };
      const supplements = await Promise.allSettled([
        invoices.generate(user, initial.id, payload),
        invoices.generate(user, initial.id, {
          ...payload,
          idempotencyKey: randomUUID(),
        }),
      ]);
      assert.equal(
        supplements.filter((r) => r.status === 'fulfilled').length,
        1,
      );
      assert.equal(
        await db.carrierInvoiceCharge.count({
          where: { chargeOpportunityId: sc.id },
        }),
        1,
      );
      if (supplements[0].status === 'fulfilled') {
        const replay = await invoices.generate(user, initial.id, payload);
        assert.equal(replay.created, false);
        await assert.rejects(
          invoices.generate(user, initial.id, {
            ...payload,
            paymentTermsDays: 17,
          }),
          /different request/,
        );
      }
      const p = await canonical(initial.id);
      const pc = await charge(initial.id, '2');
      const pt = (await invoices.preview(user, initial.id)).expectedToken;
      const paymentRace = await Promise.allSettled([
        ar.markPaid(user, initial.id, {
          invoiceId: p.id,
          amountPaid: '1',
          idempotencyKey: randomUUID(),
        }),
        invoices.generate(user, initial.id, {
          supplemental: true,
          chargeIds: [pc.id],
          expectedToken: pt,
          idempotencyKey: randomUUID(),
        }),
      ]);
      assert.equal(paymentRace[0].status, 'fulfilled');
      assert.equal(
        await db.loadPayment.count({ where: { loadId: initial.id } }),
        1,
      );
    }
    pass(
      'three PostgreSQL iterations: approval/issue, two original issuers, same-charge supplements, payment/supplement, exact/conflicting retries',
    );
    const stale = await invoices.preview(user, other.id);
    await charge(other.id, '1');
    await assert.rejects(
      invoices.generate(user, other.id, {
        chargeIds: [otherCharge.id],
        expectedToken: stale.expectedToken,
        idempotencyKey: randomUUID(),
      }),
      /preview changed/,
    );
    const history = await db.loadEvent.count({ where: { loadId: a.id } });
    await Promise.all([
      opportunities.scanLoad(user, a.id),
      opportunities.scanLoad(user, a.id),
    ]);
    assert.equal(
      await db.loadEvent.count({ where: { loadId: a.id } }),
      history,
    );
    assert.equal(
      await db.carrierInvoiceCharge.count({ where: { loadId: a.id } }),
      3,
    );
    pass(
      'stale preview rejection and concurrent scans preserve billed history',
    );
    const ambiguous = await load();
    await db.load.update({
      where: { id: ambiguous.id },
      data: {
        status: 'INVOICED',
        invoiceNumber: 'LEGACY-INCOMPLETE',
        invoiceIssuedAt: new Date(),
      },
    });
    const ac = await charge(ambiguous.id);
    await assert.rejects(issue(ambiguous.id, [ac.id], true), /reconciliation/);
    await db.financialTransaction.create({
      data: {
        organizationId: user.organizationId,
        loadId: other.id,
        type: 'INCOME',
        effect: 'INCOME',
        category: 'Manual',
        amount: '25.25',
        currency: 'USD',
        transactionDate: new Date(),
        description: 'Ambiguous manual revenue',
        idempotencyKey: randomUUID(),
        createdById: user.id,
      },
    });
    await assert.rejects(
      issue(other.id, [otherCharge.id]),
      /manual load income/,
    );
    pass('ambiguous legacy evidence and manual-income double counting blocked');
    const legacy = await load();
    const legacyNumber = `LEGACY-${randomUUID()}`;
    const issuedAt = new Date();
    const paymentDueAt = invoiceDueDate(issuedAt, 45);
    const legacyPdf = await PDFDocument.create();
    const font = await legacyPdf.embedFont(StandardFonts.Helvetica);
    legacyPdf
      .addPage()
      .drawText(
        `B1c Fictional Carrier 0\n${legacyNumber}\nSynthetic legacy invoice\n1100.00 USD\nNet 45 days\n${paymentDueAt.toISOString()}`,
        { font, size: 12, x: 50, y: 700 },
      );
    const legacyBytes = Buffer.from(await legacyPdf.save());
    const documentId = randomUUID();
    const storageKey = `documents/${documentId}/v1.pdf`;
    await storage.put(storageKey, legacyBytes);
    const legacyDoc = await db.document.create({
      data: {
        id: documentId,
        organizationId: user.organizationId,
        type: 'CARRIER_INVOICE',
        status: 'CONFIRMED',
        versions: {
          create: {
            organizationId: user.organizationId,
            versionNumber: 1,
            originalFileName: `${legacyNumber}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: legacyBytes.length,
            checksum: createHash('sha256').update(legacyBytes).digest('hex'),
            storageKey,
          },
        },
      },
      include: { versions: true },
    });
    await db.loadDocument.create({
      data: {
        organizationId: user.organizationId,
        loadId: legacy.id,
        documentId,
        role: 'CARRIER_INVOICE',
      },
    });
    await db.loadRequirement.updateMany({
      where: { loadId: legacy.id },
      data: {
        status: 'ACCEPTED',
        currentVersionId: legacyDoc.versions[0].id,
        reviewedVersionId: legacyDoc.versions[0].id,
      },
    });
    await db.load.update({
      where: { id: legacy.id },
      data: {
        status: 'INVOICED',
        invoiceNumber: legacyNumber,
        invoiceIssuedAt: issuedAt,
        paymentTermsDays: 45,
        paymentDueAt,
        billingSubmittedAt: issuedAt,
      },
    });
    await db.loadEvent.create({
      data: {
        organizationId: user.organizationId,
        loadId: legacy.id,
        type: 'INVOICE_CREATED',
        occurredAt: issuedAt,
        metadata: {
          invoicePolicy: 'tenant-invoice-v1',
          sender: { name: 'B1c Fictional Carrier 0' },
          invoiceNumber: legacyNumber,
          documentId,
          totalRate: '1100',
          currency: 'USD',
          paymentTermsDays: 45,
          paymentDueAt: paymentDueAt.toISOString(),
        },
      },
    });
    await db.loadEvent.create({
      data: {
        organizationId: user.organizationId,
        loadId: legacy.id,
        type: 'BILLING_SUBMITTED',
        occurredAt: issuedAt,
        metadata: { invoiceNumber: legacyNumber, totalRate: '1100' },
      },
    });
    const legacyPaymentKey = randomUUID();
    await ar.markPaid(user, legacy.id, {
      amountPaid: '100',
      idempotencyKey: legacyPaymentKey,
    });
    const beforeLegacy = JSON.stringify(
      await db.loadPayment.findMany({ where: { loadId: legacy.id } }),
    );
    const lc = await charge(legacy.id, '2.02');
    await issue(legacy.id, [lc.id], true);
    assert.equal(
      JSON.stringify(
        await db.loadPayment.findMany({ where: { loadId: legacy.id } }),
      ),
      beforeLegacy,
    );
    assert.equal(
      (await canonical(legacy.id)).documentVersionId,
      legacyDoc.versions[0].id,
    );
    assert.equal(
      (await invoices.preview(user, legacy.id)).invoices.find(
        (i) => !i.originalInvoiceId,
      )!.remainingBalance,
      '1000.00',
    );
    await ar.markPaid(user, legacy.id, {
      amountPaid: '100',
      idempotencyKey: legacyPaymentKey,
    });
    pass(
      'exact legacy adoption retains PDF and null-invoice receipts; original-only retry remains idempotent',
    );

    const replayLoad = await load();
    const replayCharge = await charge(replayLoad.id);
    const replayBody = {
      chargeIds: [replayCharge.id],
      expectedToken: (await invoices.preview(user, replayLoad.id))
        .expectedToken,
      idempotencyKey: randomUUID(),
    };
    const first = await invoices.generate(user, replayLoad.id, replayBody);
    const again = await invoices.generate(user, replayLoad.id, replayBody);
    assert.equal(again.invoice.documentId, first.invoice.documentId);
    assert.equal(again.created, false);
    await assert.rejects(
      invoices.generate(user, replayLoad.id, { ...replayBody, chargeIds: [] }),
      /different request/,
    );
    pass(
      'deterministic lost-response exact retry and conflicting request-key rejection',
    );

    const duplicateCharge = await charge(replayLoad.id);
    await assert.rejects(
      db.$transaction(async (tx) => {
        const data = {
          organizationId: user.organizationId,
          loadId: replayLoad.id,
          invoiceId: (await canonical(replayLoad.id)).id,
          chargeOpportunityId: duplicateCharge.id,
          amount: duplicateCharge.amount!,
          currency: 'USD',
          description: 'Rolled back constraint probe',
          snapshot: {},
        };
        await tx.carrierInvoiceCharge.create({ data });
        await tx.carrierInvoiceCharge.create({ data });
      }),
      /Unique constraint/,
    );
    assert.equal(
      await db.carrierInvoiceCharge.count({
        where: { chargeOpportunityId: duplicateCharge.id },
      }),
      0,
    );
    pass(
      'database allocation uniqueness rejects duplicates and rolls back probe without deleting evidence',
    );
    const duplicateLoad = await load();
    const receiptDocId = randomUUID(),
      receiptKey = `documents/${receiptDocId}/v1.pdf`;
    await storage.put(receiptKey, legacyBytes);
    const receiptDoc = await db.document.create({
      data: {
        id: receiptDocId,
        organizationId: user.organizationId,
        type: 'LUMPER_RECEIPT',
        status: 'CONFIRMED',
        versions: {
          create: {
            organizationId: user.organizationId,
            versionNumber: 1,
            originalFileName: 'synthetic-receipt.pdf',
            mimeType: 'application/pdf',
            sizeBytes: legacyBytes.length,
            checksum: createHash('sha256').update(legacyBytes).digest('hex'),
            storageKey: receiptKey,
          },
        },
      },
      include: { versions: true },
    });
    await db.loadDocument.create({
      data: {
        organizationId: user.organizationId,
        loadId: duplicateLoad.id,
        documentId: receiptDocId,
        role: 'LUMPER_RECEIPT',
      },
    });
    const duplicates = [];
    for (let index = 0; index < 2; index++) {
      const candidate = await db.loadChargeOpportunity.create({
        data: {
          organizationId: user.organizationId,
          loadId: duplicateLoad.id,
          sourceDocumentId: receiptDocId,
          type: 'LUMPER_REIMBURSEMENT',
          amount: '15',
          currency: 'USD',
        },
      });
      duplicates.push(candidate);
      await db.loadEvent.create({
        data: {
          organizationId: user.organizationId,
          loadId: duplicateLoad.id,
          type: 'CHARGE_OPPORTUNITY_DETECTED',
          metadata: { opportunityId: candidate.id },
        },
      });
    }
    await opportunities.approve(user, duplicates[0].id);
    const dupToken = (await invoices.preview(user, duplicateLoad.id))
      .expectedToken;
    await Promise.all([
      opportunities.scanLoad(user, duplicateLoad.id),
      invoices.generate(user, duplicateLoad.id, {
        chargeIds: [duplicates[0].id],
        expectedToken: dupToken,
        idempotencyKey: randomUUID(),
      }),
    ]);
    await opportunities.scanLoad(user, duplicateLoad.id);
    assert.equal(
      await db.loadChargeOpportunity.count({
        where: { loadId: duplicateLoad.id },
      }),
      2,
    );
    assert.equal(
      await db.loadEvent.count({
        where: {
          loadId: duplicateLoad.id,
          type: 'CHARGE_OPPORTUNITY_DETECTED',
        },
      }),
      2,
    );
    const retainedAllocation = await db.carrierInvoiceCharge.findFirstOrThrow({
      where: { chargeOpportunityId: duplicates[0].id },
    });
    assert.equal(
      (retainedAllocation.snapshot as { sourceDocumentVersionId: string })
        .sourceDocumentVersionId,
      receiptDoc.versions[0].id,
    );
    pass(
      'duplicate receipt scan versus issuance retains both opportunities/events and the billed source-version snapshot',
    );
    success = true;
  } finally {
    // Never delete immutable financial evidence to make a test pass.
    await writeFile(
      'results.json',
      JSON.stringify(
        {
          status: success ? 'PASS' : 'FAIL',
          checks,
          retainedSyntheticOrganizations: orgs,
          evidenceDirectory: resolve('evidence'),
        },
        null,
        2,
      ),
    );
    await db.$disconnect();
  }
}
void main().catch((e) => {
  console.error(
    e instanceof Error ? e.stack : 'Invoice charge acceptance failed',
  );
  process.exitCode = 1;
});
