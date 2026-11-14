// Read-only migration preservation check. Never prints database/auth credentials.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const requireApi = createRequire(path.resolve('apps/api/package.json'));
requireApi('dotenv').config({ path: 'apps/api/.env', quiet: true });
const { Client } = requireApi('pg');
const snapshotPath = path.join(os.tmpdir(), 'loadpacket-day7a-preservation.json');
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    const snapshot = {};
    for (const table of ['organizations','drivers','users','loads','load_assignments','documents','document_versions','load_events','agreements','agreement_versions','load_charge_opportunities']) {
      const columns = table === 'organizations' ? 'id,name,created_at,updated_at' : table === 'drivers' ? 'id,organization_id,first_name,last_name,email,phone,status,user_id,created_at,updated_at' : '*';
      const { rows } = await client.query(`SELECT ${columns} FROM "${table}" ORDER BY id`);
      snapshot[table] = { count: rows.length, digest: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
    }
    const duplicates = await client.query(`SELECT count(*)::int AS count FROM (SELECT organization_id, lower(btrim(email)) FROM drivers WHERE status='ACTIVE' AND email IS NOT NULL AND btrim(email)<>'' GROUP BY organization_id, lower(btrim(email)) HAVING count(*)>1) duplicate_groups`);
    if (duplicates.rows[0].count) throw new Error('Existing active-email duplicates need resolution before migration.');
    const marcus = await client.query(`SELECT d.user_id IS NOT NULL AS connected, u.active AS account_active FROM drivers d LEFT JOIN users u ON u.id=d.user_id AND u.organization_id=d.organization_id WHERE d.id='22222222-2222-4222-8222-222222222222'`);
    console.log('Preserved row counts:', JSON.stringify(Object.fromEntries(Object.entries(snapshot).map(([key,value]) => [key,value.count]))));
    console.log('Marcus mapping:', JSON.stringify(marcus.rows[0] ?? { present: false }));
    if (process.argv.includes('--before')) { fs.writeFileSync(snapshotPath, JSON.stringify(snapshot)); console.log('Baseline fingerprints saved; no active-email duplicates.'); }
    else {
      const before = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      if (JSON.stringify(before) !== JSON.stringify(snapshot)) throw new Error('Data changed since baseline; investigate before claiming preservation.');
      console.log('All pre-existing values and row counts match the baseline: PASS');
    }
  } finally { await client.end(); }
}
main().catch(() => { console.error('Database preservation check failed. Connection details and row contents suppressed.'); process.exitCode = 1; });
