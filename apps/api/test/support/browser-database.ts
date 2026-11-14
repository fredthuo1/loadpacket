import { database, type Row } from './database-fixture';

// Synthetic sequential browser persistence only. No SQL, locks or concurrency proof.
export function browserDatabase() {
  const fixture = database(((fn: unknown) => fn) as typeof jest.fn, [
    'staffInvitation',
    'financialAuditEvent',
  ]);
  type Query = { where?: Row; data?: Row; include?: Row; select?: Row };
  type Delegate = {
    create(q: Query): Promise<Row>;
    findFirst(q: Query): Promise<Row | null>;
    findUnique(q: Query): Promise<Row | null>;
    findFirstOrThrow?: (q: Query) => Promise<Row>;
    findUniqueOrThrow?: (q: Query) => Promise<Row>;
  };
  const delegates = fixture.db as unknown as Record<string, Delegate>;
  const organization = { ...fixture.tables.organization[0] };
  delete organization.id;
  delete organization.name;
  const defaults: Record<string, Row> = {
    organization,
    staffInvitation: { status: 'PENDING', acceptedAt: null, revokedAt: null },
    documentProcessingRun: {
      status: 'PENDING',
      attemptCount: 0,
      attempts: [],
      review: null,
      result: null,
      errorCode: null,
      leaseToken: null,
      leaseExpiresAt: null,
    },
  };
  for (const model of Object.keys(fixture.tables)) {
    const delegate = delegates[model];
    const create = delegate.create.bind(delegate);
    if (defaults[model])
      delegate.create = (q) =>
        create({ ...q, data: { ...defaults[model], ...q.data } });
    delegate.findFirstOrThrow = async (q) => {
      const row = await delegate.findFirst(q);
      if (!row) throw new Error('Browser fixture record not found');
      return row;
    };
    delegate.findUniqueOrThrow = async (q) => {
      const row = await delegate.findUnique(q);
      if (!row) throw new Error('Browser fixture record not found');
      return row;
    };
  }
  Object.assign(fixture.db, { $executeRaw: () => Promise.resolve(0) });
  return fixture;
}
