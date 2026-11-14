import { randomUUID } from 'node:crypto';
import { Prisma } from '../../src/generated/prisma/client';
type Row = Record<string, unknown>;
function decimal(value: unknown): Prisma.Decimal {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    value instanceof Prisma.Decimal
  )
    return new Prisma.Decimal(value);
  throw new Error('Invalid fixture monetary value');
}
type Query = {
  where?: Row;
  data?: Row;
  include?: Row;
  select?: Row;
  orderBy?: Row | Row[];
  take?: number;
  create?: Row;
  update?: Row;
};
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const orgA = id(1),
  orgB = id(2),
  loadA = id(10),
  loadB = id(11),
  otherDriverLoad = id(12);
const driverA = id(20),
  driverB = id(21),
  foreignDriver = id(22);
const documentB = id(30),
  agreementB = id(40),
  opportunityB = id(50);
const now = new Date('2026-09-17T12:00:00Z');

// A query-aware in-memory persistence boundary. Real guards, controllers,
// services, workflow validation and event recording execute in these tests.
// Removing organization/assignment predicates exposes the foreign fixtures,
// so isolation tests do not simply return null for every database lookup.
function database(spy: typeof jest.fn = jest.fn, extraTables: string[] = []) {
  const writes: string[] = [];
  const tables: Record<string, Row[]> = {
    organization: [orgA, orgB].map((id, i) => ({
      id,
      name: `Carrier ${i === 0 ? 'A' : 'B'}`,
      dbaName: null,
      mcNumber: null,
      usdotNumber: null,
      phone: null,
      email: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: 'US',
      timezone: 'America/Chicago',
      defaultPaymentTermsDays: 30,
      createdAt: now,
      updatedAt: now,
    })),
    user: [],
    driver: [],
    driverInvitation: [],
    load: [],
    loadAssignment: [],
    loadRequirement: [],
    loadStop: [],
    document: [],
    documentProcessingRun: [],
    documentVersion: [],
    organizationDocument: [],
    driverDocument: [],
    loadDocument: [],
    loadEvent: [],
    loadPayment: [],
    carrierInvoice: [],
    carrierInvoiceCharge: [],
    financialTransaction: [],
    agreement: [],
    externalTransactionAccess: [],
    agreementVersion: [],
    agreementAcceptance: [],
    loadChargeOpportunity: [],
  };
  const roles = [
    'OWNER',
    'OWNER',
    'DRIVER',
    'DRIVER',
    'DISPATCHER',
    'BACK_OFFICE',
    'OWNER',
    'DRIVER',
  ];
  tables.user = roles.map((role, i) => ({
    id: id(100 + i),
    authUserId: id(200 + i),
    organizationId: i === 1 ? orgB : orgA,
    role,
    active: i !== 6,
    firstName: i === 2 ? 'Marcus' : 'Test',
    lastName: i === 2 ? 'Reed' : 'User',
    email: `test${i}@example.com`,
  }));
  tables.driver = [driverA, driverB, foreignDriver].map((driver, i) => ({
    id: driver,
    organizationId: i === 2 ? orgB : orgA,
    userId: i < 2 ? id(102 + i) : null,
    firstName: i === 0 ? 'Marcus' : 'Other',
    lastName: 'Reed',
    status: 'ACTIVE',
    phone: null,
    email: null,
    cdlNumber: null,
    cdlState: null,
    cdlExpirationDate: null,
    hireDate: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
  }));
  tables.load = [loadA, loadB, otherDriverLoad].map((load, i) => ({
    id: load,
    organizationId: i === 1 ? orgB : orgA,
    loadNumber: `AUTH-${i}`,
    status: 'BOOKED',
    brokerName: 'Test broker',
    brokerContact: null,
    equipment: 'Van',
    currency: 'USD',
    totalRate: '1200.00',
    linehaul: '1200.00',
    fuelSurcharge: '0.00',
    invoiceNumber: null,
    invoiceIssuedAt: null,
    billingSubmittedAt: null,
    paymentDueAt: null,
    paymentTermsDays: null,
    billingRecipientName: null,
    billingRecipientEmail: null,
    paidAt: null,
    amountPaid: null,
    createdAt: now,
    updatedAt: now,
  }));
  tables.loadAssignment = [loadA, loadB, otherDriverLoad].map((load, i) => ({
    id: id(60 + i),
    organizationId: i === 1 ? orgB : orgA,
    loadId: load,
    driverId: i === 0 ? driverA : i === 1 ? foreignDriver : driverB,
    status: 'ASSIGNED',
    assignedAt: now,
    acceptedAt: null,
    completedAt: null,
  }));
  tables.loadRequirement = ['BOL', 'POD', 'CARRIER_INVOICE'].map((type, i) => ({
    id: id(70 + i),
    organizationId: orgA,
    loadId: loadA,
    documentType: type,
    requirement: 'REQUIRED',
    status: 'MISSING',
    createdAt: now,
  }));
  tables.document.push({
    id: documentB,
    organizationId: orgB,
    type: 'RATE_CONFIRMATION',
    status: 'UPLOADED',
    createdAt: now,
    updatedAt: now,
  });
  tables.agreement.push({
    id: agreementB,
    organizationId: orgB,
    loadId: loadB,
    type: 'RATE_CONFIRMATION',
    status: 'PENDING',
    title: 'Test terms',
    createdAt: now,
    updatedAt: now,
  });
  tables.loadChargeOpportunity.push({
    id: opportunityB,
    organizationId: orgB,
    loadId: loadB,
    type: 'LUMPER_REIMBURSEMENT',
    status: 'DETECTED',
    amount: '100.00',
    currency: 'USD',
    detectedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  function matches(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (value === undefined) return true;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const condition = value as Row;
        if ('equals' in condition)
          return condition.mode === 'insensitive'
            ? String(row[key]).toLowerCase() ===
                String(condition.equals).toLowerCase()
            : row[key] === condition.equals;
        if (key === 'organizationId_loadId') return matches(row, condition);
        if ('not' in condition) return row[key] !== condition.not;
        if ('in' in condition)
          return (condition.in as unknown[]).includes(row[key]);
        if ('some' in condition && key === 'assignments')
          return tables.loadAssignment.some(
            (a) => a.loadId === row.id && matches(a, condition.some as Row),
          );
        return false;
      }
      return row[key] === value;
    });
  }
  function loadRelations(row: Row): Row {
    return {
      ...row,
      totalRate: decimal(row.totalRate ?? 0),
      linehaul: row.linehaul == null ? null : decimal(row.linehaul),
      fuelSurcharge:
        row.fuelSurcharge == null ? null : decimal(row.fuelSurcharge),
      stops: tables.loadStop.filter((r) => r.loadId === row.id),
      requirements: tables.loadRequirement.filter((r) => r.loadId === row.id),
      assignments: tables.loadAssignment
        .filter((r) => r.loadId === row.id)
        .map((r) => ({
          ...r,
          driver: tables.driver.find((d) => d.id === r.driverId),
        })),
      documents: tables.loadDocument
        .filter((r) => r.loadId === row.id)
        .map((r) => ({
          ...r,
          document: hydrate(
            'document',
            tables.document.find((d) => d.id === r.documentId)!,
          ),
        })),
      carrierInvoices: tables.carrierInvoice
        .filter((r) => r.loadId === row.id)
        .map((r) => hydrate('carrierInvoice', r)),
      payments: tables.loadPayment
        .filter((r) => r.loadId === row.id)
        .map((r) => hydrate('loadPayment', r)),
      financialTransactions: tables.financialTransaction.filter(
        (r) => r.loadId === row.id,
      ),
      events: tables.loadEvent.filter((r) => r.loadId === row.id),
      agreements: [],
      chargeOpportunities: tables.loadChargeOpportunity
        .filter((r) => r.loadId === row.id)
        .map((r) => hydrate('loadChargeOpportunity', r)),
    };
  }
  function hydrate(model: string, row: Row, query: Query = {}): Row {
    if (model === 'carrierInvoice')
      return {
        ...row,
        originalInvoiceId: row.originalInvoiceId ?? null,
        submittedAt: row.submittedAt ?? null,
        totalAmount: new Prisma.Decimal(String(row.totalAmount)),
        documentVersion: tables.documentVersion.find(
          (v) => v.id === row.documentVersionId,
        ),
        load: tables.load.find((l) => l.id === row.loadId),
        original:
          tables.carrierInvoice.find((i) => i.id === row.originalInvoiceId) ??
          null,
      };
    if (model === 'loadPayment')
      return {
        ...row,
        invoiceId: row.invoiceId ?? null,
        amount: new Prisma.Decimal(String(row.amount)),
      };
    if (model === 'loadChargeOpportunity')
      return {
        ...row,
        amount: row.amount == null ? null : decimal(row.amount),
      };
    if (model === 'driver') {
      const invitation =
        tables.driverInvitation.find((i) => i.driverId === row.id) ?? null;
      const config = (query.select?.assignments ??
        query.include?.assignments) as Query | undefined;
      return {
        ...row,
        invitation:
          query.select?.invitation && invitation
            ? { status: invitation.status, lastSentAt: invitation.lastSentAt }
            : invitation,
        ...(query.include?.user
          ? { user: tables.user.find((u) => u.id === row.userId) ?? null }
          : {}),
        ...(query.include?.organization
          ? {
              organization: tables.organization.find(
                (o) => o.id === row.organizationId,
              ),
            }
          : {}),
        ...(config
          ? {
              assignments: tables.loadAssignment
                .filter(
                  (a) => a.driverId === row.id && matches(a, config.where),
                )
                .sort((a, b) => Number(b.assignedAt) - Number(a.assignedAt))
                .slice(0, config.take ?? Infinity)
                .map((a) => hydrate('loadAssignment', a)),
            }
          : {}),
      };
    }
    if (model === 'user')
      return {
        ...row,
        driver: (() => {
          const driver = tables.driver.find((d) => d.userId === row.id);
          return driver ? hydrate('driver', driver) : null;
        })(),
      };
    if (model === 'load') {
      const result = loadRelations(row);
      const relations = query.include ?? query.select ?? {};
      for (const name of ['requirements', 'documents']) {
        const config = relations[name];
        if (config && typeof config === 'object' && 'where' in config) {
          result[name] = (result[name] as Row[]).filter((item) =>
            matches(item, config.where as Row),
          );
        }
      }
      return result;
    }
    if (model === 'loadEvent')
      return { ...row, load: tables.load.find((l) => l.id === row.loadId) };
    if (model === 'loadAssignment')
      return {
        ...row,
        load: loadRelations(tables.load.find((l) => l.id === row.loadId)!),
        driver: tables.driver.find((d) => d.id === row.driverId),
      };
    if (model === 'document')
      return {
        ...row,
        organization: tables.organization.find(
          (o) => o.id === row.organizationId,
        ),
        organizationDocument:
          tables.organizationDocument.find((d) => d.documentId === row.id) ??
          null,
        driverDocument: (() => {
          const link = tables.driverDocument.find(
            (d) => d.documentId === row.id,
          );
          return link
            ? {
                ...link,
                driver: tables.driver.find((d) => d.id === link.driverId),
              }
            : null;
        })(),
        loadDocuments: tables.loadDocument
          .filter((d) => d.documentId === row.id)
          .map((d) => ({
            ...d,
            load: tables.load.find((l) => l.id === d.loadId),
          })),
        versions: tables.documentVersion
          .filter((v) => v.documentId === row.id)
          .sort((a, b) => Number(b.versionNumber) - Number(a.versionNumber))
          .map((v) => ({
            ...v,
            uploadedBy:
              tables.user.find((u) => u.id === v.uploadedByUserId) ?? null,
          })),
      };
    if (model === 'documentVersion' && query.include?.document)
      return {
        ...row,
        document: hydrate(
          'document',
          tables.document.find((d) => d.id === row.documentId)!,
        ),
      };
    if (model === 'agreement')
      return {
        ...row,
        versions: [],
        load: loadRelations(tables.load.find((l) => l.id === row.loadId)!),
      };
    if (model === 'loadChargeOpportunity')
      return {
        ...row,
        load: tables.load.find((l) => l.id === row.loadId),
        sourceDocument: null,
      };
    return row;
  }
  for (const table of extraTables) tables[table] ??= [];
  const delegates = Object.fromEntries(
    Object.keys(tables).map((model) => {
      const find = (q: Query = {}) =>
        tables[model]
          .filter((r) => matches(r, q.where))
          .sort((a, b) => {
            if (!q.orderBy || Array.isArray(q.orderBy)) return 0;
            const [key, direction] = Object.entries(q.orderBy)[0];
            const compared =
              a[key] instanceof Date
                ? Number(a[key]) - Number(b[key])
                : typeof a[key] === 'number'
                  ? Number(a[key]) - Number(b[key])
                  : String(a[key]).localeCompare(String(b[key]));
            return direction === 'desc' ? -compared : compared;
          })
          .slice(0, q.take ?? Infinity)
          .map((r) => hydrate(model, r, q));
      return [
        model,
        {
          findFirst: spy((q: Query = {}) =>
            Promise.resolve(find(q)[0] ?? null),
          ),
          findUnique: spy((q: Query = {}) =>
            Promise.resolve(find(q)[0] ?? null),
          ),
          findMany: spy((q: Query = {}) => Promise.resolve(find(q))),
          count: spy((q: Query = {}) => Promise.resolve(find(q).length)),
          aggregate: spy((q: Query = {}) =>
            Promise.resolve({
              _sum: { totalRate: '0.00', amountPaid: '0.00' },
              _count: { _all: find(q).length },
            }),
          ),
          update: spy((q: Query) => {
            writes.push(model);
            const row = tables[model].find((r) => matches(r, q.where));
            if (!row) throw new Error('Update did not match any row');
            Object.assign(
              row,
              Object.fromEntries(
                Object.entries(q.data ?? {}).filter(
                  ([, value]) => value !== undefined,
                ),
              ),
            );
            return Promise.resolve(hydrate(model, row));
          }),
          updateMany: spy((q: Query) => {
            const rows = tables[model].filter((r) => matches(r, q.where));
            rows.forEach((r) => Object.assign(r, q.data));
            return Promise.resolve({ count: rows.length });
          }),
          create: spy((q: Query) => {
            const row: Row = {
              ...(model === 'externalTransactionAccess'
                ? { revokedAt: null, lastAccessedAt: null }
                : {}),
              ...(model === 'user' ? { active: true } : {}),
              ...(model === 'driverInvitation'
                ? {
                    status: 'PENDING',
                    firstSentAt: new Date(),
                    lastSentAt: new Date(),
                    acceptedAt: null,
                    cancelledAt: null,
                  }
                : {}),
              ...(model === 'driver'
                ? {
                    userId: null,
                    email: null,
                    phone: null,
                    cdlNumber: null,
                    cdlState: null,
                    cdlExpirationDate: null,
                    hireDate: null,
                    notes: null,
                  }
                : {}),
              id: randomUUID(),
              createdAt: now,
              updatedAt: now,
              ...q.data,
            };
            if (model === 'document' && row.versions) {
              const version = (row.versions as { create: Row }).create;
              tables.documentVersion.push({
                id: randomUUID(),
                createdAt: now,
                documentId: row.id,
                ...version,
              });
              delete row.versions;
            }
            if (model === 'load') {
              for (const field of ['linehaul', 'fuelSurcharge', 'totalRate']) {
                const value = row[field];
                if (value instanceof Prisma.Decimal)
                  row[field] = value.toString();
              }
              for (const [relation, table] of [
                ['stops', 'loadStop'],
                ['requirements', 'loadRequirement'],
                ['documents', 'loadDocument'],
              ]) {
                const nested = row[relation] as
                  { create: Row | Row[] } | undefined;
                if (nested) {
                  const children = Array.isArray(nested.create)
                    ? nested.create
                    : [nested.create];
                  for (const child of children)
                    tables[table].push({
                      id: randomUUID(),
                      loadId: row.id,
                      createdAt: now,
                      ...(table === 'loadRequirement'
                        ? { status: 'MISSING' }
                        : {}),
                      ...child,
                    });
                }
                delete row[relation];
              }
            }
            if (model === 'carrierInvoice') {
              row.originalInvoiceId ??= null;
              row.submittedAt ??= null;
              row.totalAmount = String(row.totalAmount);
            }
            if (model === 'loadPayment') {
              row.invoiceId ??= null;
              row.amount = String(row.amount);
            }
            tables[model].push(row);
            return Promise.resolve(hydrate(model, row));
          }),
          upsert: spy((q: Query) => {
            let row = tables[model].find((r) => matches(r, q.where));
            if (row) Object.assign(row, q.update);
            else {
              row = {
                id: randomUUID(),
                createdAt: now,
                updatedAt: now,
                ...q.create,
              };
              tables[model].push(row);
            }
            return Promise.resolve(hydrate(model, row));
          }),
        },
      ];
    }),
  );
  const db = {
    ...delegates,
    $queryRaw: spy(() => Promise.resolve([{ health_check: 1 }])),
    $transaction: async (
      fn: ((client: unknown) => Promise<unknown>) | Promise<unknown>[],
    ) => {
      const before = structuredClone(tables);
      const writeCount = writes.length;
      try {
        return await (Array.isArray(fn) ? Promise.all(fn) : fn(db));
      } catch (error) {
        Object.assign(tables, before);
        writes.length = writeCount;
        throw error;
      }
    },
  };
  return { db, tables, writes };
}

export {
  database,
  id,
  orgA,
  orgB,
  loadA,
  loadB,
  otherDriverLoad,
  driverA,
  driverB,
  foreignDriver,
  documentB,
  agreementB,
  opportunityB,
  now,
};
export type { Row };
