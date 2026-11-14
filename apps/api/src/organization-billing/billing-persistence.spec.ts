import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { billingTestDatasource } from '../../prisma/billing-test-target';

const api = resolve(__dirname, '../..');
const migration = readFileSync(
  resolve(
    api,
    'prisma/migrations/20261111120000_organization_billing_persistence/migration.sql',
  ),
  'utf8',
);
const schema = readFileSync(resolve(api, 'prisma/schema.prisma'), 'utf8');
const newTables = [
  'organization_subscriptions',
  'organization_billing_customers',
  'organization_billing_links',
  'organization_billing_events',
  'organization_usage_buckets',
  'organization_usage_reservations',
  'assignment_entitlement_grants',
];

function triggerBody(name: string): string {
  const start = migration.indexOf(`CREATE FUNCTION ${name}()`);
  if (start < 0) throw new Error(`Missing SQL function: ${name}`);
  const end = migration.indexOf('END $$;', start);
  if (end < 0) throw new Error(`Missing SQL function terminator: ${name}`);
  return migration.slice(start, end);
}

describe('billing-test target isolation (no network)', () => {
  const url =
    'postgresql://synthetic:synthetic@127.0.0.1:55439/loadpacket_billing_verified_test';
  it('offline mode supplies no datasource, even if a connection is passed', () => {
    expect(billingTestDatasource('offline', url)).toBeUndefined();
    expect(billingTestDatasource('offline', 'not-a-url')).toBeUndefined();
  });
  it('isolated mode accepts only the explicitly allowlisted target', () => {
    expect(billingTestDatasource('isolated', url)).toEqual({ url });
  });
  it.each([undefined, '', 'production', 'test'])(
    'requires explicit mode: %s',
    (mode) => {
      expect(() => billingTestDatasource(mode, url)).toThrow();
    },
  );
  it.each([
    undefined,
    '',
    'not-a-url',
    'postgresql://synthetic:synthetic@localhost:55439/loadpacket_billing_verified_test',
    'postgresql://synthetic:synthetic@127.0.0.1:5432/loadpacket_billing_verified_test',
    'postgresql://synthetic:synthetic@remote.invalid:55439/loadpacket_billing_verified_test',
    'postgresql://synthetic:synthetic@127.0.0.1:55439/loadpacket_finance_verified_test',
    'postgresql://synthetic:synthetic@127.0.0.1:55439/postgres',
    'postgresql://synthetic@127.0.0.1:55439/loadpacket_billing_verified_test',
    `${url}?host=remote.invalid`,
    `${url}?schema=other`,
    `${url}#fragment`,
  ])(
    'rejects alternate/missing connection without echoing it: case %#',
    (candidate) => {
      expect(() => billingTestDatasource('isolated', candidate)).toThrow();
      try {
        billingTestDatasource('isolated', candidate);
      } catch (error) {
        expect(String(error)).not.toContain('synthetic');
      }
    },
  );
  it('never reads the normal database variable or dotenv', () => {
    const config = readFileSync(
      resolve(api, 'prisma.billing-test.config.ts'),
      'utf8',
    );
    const target = readFileSync(
      resolve(api, 'prisma/billing-test-target.ts'),
      'utf8',
    );
    expect(config).not.toMatch(
      /process\.env\.(DATABASE_URL|DIRECT_URL)|import\s+['"]dotenv/,
    );
    expect(target).not.toMatch(/process\.env|require\(['"]dotenv/);
  });
});

describe('offline migration safety contract (not PostgreSQL execution)', () => {
  it('creates exactly seven tables and only alters new tables', () => {
    const created = [...migration.matchAll(/CREATE TABLE "(\w+)"/g)].map(
      (m) => m[1],
    );
    expect(created.sort()).toEqual([...newTables].sort());
    const altered = [...migration.matchAll(/ALTER TABLE "?(\w+)"?/g)].map(
      (m) => m[1],
    );
    expect(altered.every((name) => newTables.includes(name))).toBe(true);
    expect(migration).not.toMatch(/^\s*(DROP|TRUNCATE|ALTER TYPE|RENAME)\s/im);
    expect(migration).toMatch(/BEGIN;/);
    expect(migration.trim().endsWith('COMMIT;')).toBe(true);
  });
  it('qualifies every non-organization foreign key by tenant', () => {
    const fks = [
      ...migration.matchAll(
        /FOREIGN KEY \(([^)]+)\) REFERENCES "(\w+)"\(([^)]+)\) ([^;]+);/g,
      ),
    ];
    expect(fks.length).toBeGreaterThan(10);
    for (const [, fields, table, references, action] of fks) {
      expect(fields).toContain('"organization_id"');
      if (table !== 'organizations')
        expect(references).toContain('"organization_id"');
      expect(action).toContain('ON DELETE RESTRICT ON UPDATE NO ACTION');
    }
  });
  it('keeps provider identifiers outside the domain subscription model', () => {
    const model = schema.match(
      /model OrganizationSubscription \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(model).toBeDefined();
    expect(model).toMatch(/organizationId String @id/);
    expect(model).not.toMatch(
      /provider|externalCustomer|externalSubscription|price/i,
    );
  });
  it('retains database guards for audit, immutable ownership, quota accounting and grants', () => {
    for (const name of [
      'billing_subscription_guard',
      'billing_subscription_audit',
      'billing_customer_guard',
      'billing_link_guard',
      'billing_event_guard',
      'billing_bucket_guard',
      'billing_reservation_guard',
      'billing_reservation_counters',
      'billing_bucket_balance',
      'billing_grant_guard',
      'billing_grant_audit',
    ])
      expect(migration).toMatch(
        new RegExp(`(?:CONSTRAINT )?TRIGGER ${name}\\b`),
      );
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(migration).toContain('billing_one_current_link');
    expect(migration).toContain('billing_applied_revision');
    expect(migration.match(/BEFORE TRUNCATE ON/g)).toHaveLength(7);
  });
  it('audits each queued subscription revision instead of rereading the final row', () => {
    const audit = triggerBody('billing_require_subscription_audit');
    expect(audit).toContain(
      "CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END",
    );
    expect(audit).toContain('e.applied_revision=NEW.revision');
    expect(audit).toContain('e.after_snapshot=to_jsonb(NEW)');
    expect(audit).toContain(
      'e.before_snapshot IS NOT DISTINCT FROM expected_before',
    );
    expect(audit).not.toMatch(/FROM\s+organization_subscriptions/i);
    expect(migration).toMatch(
      /billing_subscription_audit AFTER INSERT OR UPDATE[^;]+DEFERRABLE INITIALLY DEFERRED/,
    );
  });
  it('checks ledger truth even for unrelated nested counter writes', () => {
    const guard = triggerBody('billing_protect_bucket');
    expect(migration).not.toContain('pg_trigger_depth(');
    expect(guard).toContain('FROM organization_usage_reservations');
    expect(guard).toContain(
      'bucket_id=NEW.id AND organization_id=NEW.organization_id',
    );
    expect(guard).toContain(
      'IF NEW.used<>actual_used OR NEW.reserved<>actual_reserved',
    );
    expect(guard).toContain(
      "RAISE EXCEPTION 'Counters must equal the reservation ledger'",
    );
  });
  it('enforces aggregate capacity on growth without blocking downgrade continuation', () => {
    const guard = triggerBody('billing_protect_bucket');
    expect(guard).toContain(
      'NEW.used::numeric+NEW.reserved>OLD.used::numeric+OLD.reserved',
    );
    expect(guard).toContain(
      'NEW."limit" IS NOT NULL AND NEW.used::numeric+NEW.reserved>NEW."limit"',
    );
    expect(guard).toContain("RAISE EXCEPTION 'Quota exceeded'");
  });
  it('locks and suppresses retries before writes, but never increments counters before insertion', () => {
    const guard = triggerBody('billing_apply_reservation');
    expect(guard).toContain('Conflicting reservation retry');
    expect(guard.indexOf('RETURN NULL;')).toBeLessThan(
      guard.indexOf('SELECT * INTO bucket'),
    );
    expect(guard).toContain(
      'id=NEW.bucket_id AND organization_id=NEW.organization_id FOR UPDATE',
    );
    expect(guard).not.toContain('UPDATE organization_usage_buckets');
  });
  it('synchronizes full statement totals after writes, including multi-row and ON CONFLICT inserts', () => {
    const sync = triggerBody('billing_sync_reservation_counters');
    expect(migration).toContain(
      'billing_reservation_counters AFTER INSERT OR UPDATE ON organization_usage_reservations',
    );
    expect(sync).toContain("sum(quantity) FILTER (WHERE state='COMMITTED')");
    expect(sync).toContain("sum(quantity) FILTER (WHERE state='RESERVED')");
    expect(sync).toContain('actual_used+actual_reserved>9007199254740991');
    expect(sync).toContain(
      'SET used=actual_used::bigint,reserved=actual_reserved::bigint',
    );
    expect(sync).toContain(
      'WHERE id=NEW.bucket_id AND organization_id=NEW.organization_id',
    );
    expect(sync).not.toMatch(/reserved\s*[+-]\s*NEW\.quantity/);
    const deferred = triggerBody('billing_verify_bucket');
    expect(deferred).toContain(
      'SELECT * INTO b FROM organization_usage_buckets',
    );
    expect(deferred).toContain(
      'b.used<>actual_used OR b.reserved<>actual_reserved',
    );
  });
  it('converts existing timestamp-without-zone assignment evidence to UTC instants explicitly', () => {
    const assignments = readFileSync(
      resolve(
        api,
        'prisma/migrations/20260911031541_add_driver_assignments/migration.sql',
      ),
      'utf8',
    );
    const events = readFileSync(
      resolve(
        api,
        'prisma/migrations/20260917031232_add_day6_autopilot_foundation/migration.sql',
      ),
      'utf8',
    );
    expect(assignments).toContain('"assigned_at" TIMESTAMP(3)');
    expect(events).toContain('"occurred_at" TIMESTAMP(3)');
    expect(migration).toContain('"assigned_at" TIMESTAMPTZ(3)');
    const grant = triggerBody('billing_protect_grant');
    expect(grant).toContain(
      "(a.assigned_at AT TIME ZONE 'UTC')<>NEW.assigned_at",
    );
    expect(grant).toContain(
      "(occurred_at AT TIME ZONE 'UTC')>=NEW.assigned_at",
    );
  });
  it('only generates schema-file diffs with an empty datasource and credential-free child environment', () => {
    const helper = readFileSync(
      resolve(api, 'prisma/billing-offline-diff.cjs'),
      'utf8',
    );
    expect(helper.match(/tag: 'schemaDatamodel'/g)).toHaveLength(2);
    expect(helper).toContain("['--datasource', '{}']");
    expect(helper).not.toContain('schemaDatasource');
    expect(helper).not.toMatch(/env:\s*process\.env|\.\.\.process\.env/);
  });
});
