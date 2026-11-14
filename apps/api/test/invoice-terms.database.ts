import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';
import { CanvasFactory } from 'pdf-parse/worker';
import { PrismaService } from '../src/database/prisma.service';
import { LoadEventsService } from '../src/load-events/load-events.service';
import { CarrierInvoiceService } from '../src/loads/carrier-invoice.service';
import { BillingSubmissionService } from '../src/loads/billing-submission.service';
import { BillingPacketService } from '../src/loads/billing-packet.service';
import { AccountsReceivableService } from '../src/loads/accounts-receivable.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import type { DocumentStorage } from '../src/documents/document-storage';
import { getBusinessDateIso } from '../src/loads/business-date.util';

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '55439');
  assert.equal(url.pathname, '/loadpacket_finance_verified_test');
  const db = new PrismaService();
  const organizations = [randomUUID(), randomUUID()];
  const files = new Map<string, Buffer>();
  const storage: DocumentStorage = {
    put: (key, bytes) => {
      assert(!files.has(key));
      files.set(key, Buffer.from(bytes));
      return Promise.resolve();
    },
    read: (key) => Promise.resolve(Buffer.from(files.get(key)!)),
    removeUncommitted: (key) => {
      files.delete(key);
      return Promise.resolve();
    },
  };
  const events = new LoadEventsService(db);
  const invoices = new CarrierInvoiceService(db, events, storage);
  const billing = new BillingSubmissionService(db, events);
  const packets = new BillingPacketService(db, storage);
  const ar = new AccountsReceivableService(db, events);
  const results: string[] = [];
  const pass = (name: string) => {
    results.push(name);
    console.log(`PASS ${name}`);
  };
  const text = async (bytes: Buffer) => {
    const parser = new PDFParse({ data: bytes, CanvasFactory });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  };
  try {
    await db.$connect();
    const users: AuthenticatedUser[] = [];
    for (const [index, organizationId] of organizations.entries()) {
      await db.organization.create({
        data: {
          id: organizationId,
          name: `Fictional Carrier ${index === 0 ? 'A' : 'B'}`,
          defaultPaymentTermsDays: index === 0 ? 45 : 0,
          addressLine1: `${index + 1} Synthetic Street`,
          email: `carrier${index}@example.invalid`,
        },
      });
      const user = await db.user.create({
        data: {
          organizationId,
          authUserId: randomUUID(),
          firstName: 'Invoice',
          lastName: 'Test',
          email: `invoice${index}@example.invalid`,
          role: 'OWNER',
        },
      });
      users.push({ ...user, driverId: null, driverName: null });
    }
    const load = (user: AuthenticatedUser, terms?: number) =>
      db.load.create({
        data: {
          organizationId: user.organizationId,
          loadNumber: `INV-${randomUUID()}`,
          brokerName: 'Synthetic Broker',
          status: 'DELIVERED',
          totalRate: '1234.56',
          paymentTermsDays: terms,
          requirements: {
            create: {
              organizationId: user.organizationId,
              documentType: 'CARRIER_INVOICE',
              requirement: 'REQUIRED',
              status: 'MISSING',
            },
          },
        },
      });
    const a = await load(users[0]);
    const b = await load(users[1]);
    await invoices.generate(users[0], a.id);
    await invoices.generate(users[1], b.id);
    const stored = async (id: string, user: AuthenticatedUser) => {
      const row = await db.load.findFirstOrThrow({
        where: { id, organizationId: user.organizationId },
        include: {
          documents: { include: { document: { include: { versions: true } } } },
        },
      });
      const version = row.documents[0].document.versions[0];
      return { row, version, bytes: files.get(version.storageKey)! };
    };
    const firstA = await stored(a.id, users[0]);
    const firstB = await stored(b.id, users[1]);
    const aText = await text(firstA.bytes),
      bText = await text(firstB.bytes);
    assert(
      aText.includes('Fictional Carrier A') &&
        !aText.includes('Fictional Carrier B'),
    );
    assert(
      bText.includes('Fictional Carrier B') &&
        !bText.includes('Fictional Carrier A'),
    );
    assert(
      aText.includes('1 Synthetic Street') &&
        aText.includes('carrier0@example.invalid'),
    );
    assert.equal(firstA.row.paymentTermsDays, 45);
    assert.equal(firstB.row.paymentTermsDays, 0);
    assert.equal(
      getBusinessDateIso(firstB.row.paymentDueAt!),
      getBusinessDateIso(firstB.row.invoiceIssuedAt!),
    );
    pass(
      'A/B sender isolation, profile details, company defaults and due-on-invoice-date',
    );
    await assert.rejects(invoices.generate(users[0], b.id), /not found/);
    pass('foreign load cannot use caller identity or expose sender');
    const override = await load(users[0], 12);
    await invoices.generate(users[0], override.id, { paymentTermsDays: 365 });
    assert.equal(
      (await stored(override.id, users[0])).row.paymentTermsDays,
      365,
    );
    const agreed = await load(users[0], 0);
    await invoices.generate(users[0], agreed.id);
    assert.equal((await stored(agreed.id, users[0])).row.paymentTermsDays, 0);
    pass('explicit override wins and agreed zero beats company default');
    await billing.submit(users[0], a.id, { recipientName: 'Synthetic Broker' });
    const packet = await packets.generate(users[0], a.id);
    const packetText = await text(packet.buffer);
    assert(
      packetText.includes('Fictional Carrier A') &&
        packetText.includes('Net 45 days'),
    );
    const dueLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      dateStyle: 'medium',
    }).format(firstA.row.paymentDueAt!);
    assert(aText.includes(dueLabel) && packetText.includes(dueLabel));
    const dashboard = await ar.getDashboard(users[0]);
    const invoice = dashboard.invoices.find((row) => row.id === a.id)!;
    assert.equal(invoice.paymentTermsDays, 45);
    assert.equal(
      invoice.paymentDueAt?.toISOString(),
      firstA.row.paymentDueAt?.toISOString(),
    );
    assert.equal(invoice.remainingBalance, '1234.56');
    pass(
      'PDF, merged packet, persisted billing, A/R date and exact balance agree',
    );
    await assert.rejects(
      billing.submit(users[1], b.id, {
        recipientName: 'Synthetic Broker',
        paymentTermsDays: 30,
      }),
      /already issued/,
    );
    pass('billing rejects a conflicting override after issue');
    const historical = JSON.stringify({
      version: firstA.version,
      due: firstA.row.paymentDueAt,
      terms: firstA.row.paymentTermsDays,
    });
    await db.organization.update({
      where: { id: organizations[0] },
      data: { name: 'Updated Fictional Carrier A', defaultPaymentTermsDays: 7 },
    });
    const repeated = await invoices.generate(users[0], a.id);
    assert.equal(repeated.created, false);
    const preserved = await stored(a.id, users[0]);
    assert.equal(
      JSON.stringify({
        version: preserved.version,
        due: preserved.row.paymentDueAt,
        terms: preserved.row.paymentTermsDays,
      }),
      historical,
    );
    assert(firstA.bytes.equals(preserved.bytes));
    assert.equal(
      createHash('sha256').update(preserved.bytes).digest('hex'),
      firstA.version.checksum,
    );
    const fresh = await load(users[0]);
    await invoices.generate(users[0], fresh.id);
    const freshStored = await stored(fresh.id, users[0]);
    assert(
      (await text(freshStored.bytes)).includes('Updated Fictional Carrier A'),
    );
    assert.equal(freshStored.row.paymentTermsDays, 7);
    pass(
      'profile changes affect new invoices only; issued PDF, version, checksum and terms remain unchanged',
    );
    const concurrent = await load(users[0]);
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        invoices.generate(users[0], concurrent.id),
      ),
    );
    assert(
      attempts.some(
        (item) => item.status === 'fulfilled' && item.value.created,
      ),
    );
    assert.equal(
      await db.loadDocument.count({
        where: {
          organizationId: organizations[0],
          loadId: concurrent.id,
          role: 'CARRIER_INVOICE',
        },
      }),
      1,
    );
    assert.equal(
      await db.loadEvent.count({
        where: {
          organizationId: organizations[0],
          loadId: concurrent.id,
          type: 'INVOICE_CREATED',
        },
      }),
      1,
    );
    assert.equal(
      (await invoices.generate(users[0], concurrent.id)).created,
      false,
    );
    assert.equal(
      files.size,
      await db.documentVersion.count({
        where: { organizationId: { in: organizations } },
      }),
    );
    pass(
      'four concurrent generation requests produce one invoice/event, safe retry and no orphan test files',
    );
    await db.organization.update({
      where: { id: organizations[0] },
      data: { name: ' ' },
    });
    const missing = await load(users[0]);
    await assert.rejects(
      invoices.generate(users[0], missing.id),
      /Company setup required/,
    );
    assert.equal(
      await db.loadDocument.count({ where: { loadId: missing.id } }),
      0,
    );
    pass('missing legal name fails clearly before invoice creation');
    await writeFile('carrier-a.pdf', firstA.bytes);
    await writeFile('carrier-b.pdf', firstB.bytes);
    await writeFile('billing-packet.pdf', packet.buffer);
    await writeFile(
      'results.json',
      JSON.stringify({ status: 'PASS', checks: results }, null, 2),
    );
  } finally {
    // Issued canonical evidence is permanently immutable. Retain this run's fictional
    // tenants and persist every generated PDF; never disable protection for cleanup.
    await mkdir('retained-evidence', { recursive: true });
    for (const [key, bytes] of files)
      await writeFile('retained-evidence/' + key.replaceAll('/', '_'), bytes);
    await writeFile(
      'retained-fixtures.json',
      JSON.stringify({ organizations, keys: [...files.keys()] }, null, 2),
    );
    await db.$disconnect();
    console.log('Synthetic invoice evidence retained (immutability policy)');
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Invoice checks failed',
  );
  process.exitCode = 1;
});
