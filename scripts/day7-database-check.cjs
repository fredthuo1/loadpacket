const path = require('node:path');
const { createRequire } = require('node:module');
const requireApi = createRequire(path.resolve('apps/api/package.json'));
requireApi('dotenv').config({ path: 'apps/api/.env', quiet: true });
const { Client } = requireApi('pg');
async function main() {
  console.log('Auth configuration presence:', JSON.stringify(Object.fromEntries(['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','DEV_OWNER_AUTH_USER_ID','DEV_DRIVER_AUTH_USER_ID'].map(k=>[k,Boolean(process.env[k])]))));
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
    const role = await client.query('SELECT rolsuper OR rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user');
    console.log('Database role bypasses RLS:', role.rows[0].bypass);
    const counts = {};
    for (const table of ['organizations','drivers','loads','documents','document_versions','load_events','agreements','agreement_versions','load_charge_opportunities']) {
      counts[table] = (await client.query(`SELECT count(*)::int AS count FROM "${table}"`)).rows[0].count;
    }
    console.log('Existing row counts:', JSON.stringify(counts));
    const security = await client.query(`SELECT c.relname AS table_name, c.relrowsecurity AS rls,
      has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_access,
      has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_access
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
      ORDER BY c.relname`);
    console.log('Business-table Data API protection:', JSON.stringify(security.rows));
    if (security.rows.some(row => !row.rls || row.anon_access || row.authenticated_access)) throw new Error('Unexpected Data API access');
    console.log('Applied migrations:', (await client.query('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')).rows.map(row=>row.migration_name).join(', '));
  } catch {
    console.error('Database verification failed. Check connectivity and database configuration; connection details suppressed.');
    process.exitCode = 1;
  } finally { await client.end(); }
}
void main();
