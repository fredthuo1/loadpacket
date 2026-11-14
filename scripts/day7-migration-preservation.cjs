// Read-only fingerprints of pre-existing columns; forward-added columns are excluded.
// No row values, secrets, or authentication identifiers are persisted or printed.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const requireApi = createRequire(path.resolve('apps/api/package.json'));
requireApi('dotenv').config({ path: 'apps/api/.env', quiet: true });
const { Client } = requireApi('pg');
const snapshotPath = path.join(os.tmpdir(), 'loadpacket-day7-migration-preservation.json');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    const before = process.argv.includes('--before');
    const snapshot = before ? {} : JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    if (before) {
      const { rows } = await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations' ORDER BY table_name,ordinal_position");
      for (const row of rows) (snapshot[row.table_name] ??= { columns: [] }).columns.push(row.column_name);
    }
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    for (const [table, entry] of Object.entries(snapshot)) {
      const { rows } = await client.query(`SELECT ${entry.columns.map(quote).join(',')} FROM ${quote(table)}`);
      const digest = createHash('sha256').update(JSON.stringify(rows.map(row => JSON.stringify(row)).sort())).digest('hex');
      if (before) Object.assign(entry, { count: rows.length, digest });
      else if (entry.count !== rows.length || entry.digest !== digest) throw new Error('Preservation mismatch');
    }
    await client.query('COMMIT');
    if (before) fs.writeFileSync(snapshotPath, JSON.stringify(snapshot));
    console.log(before ? 'Baseline saved.' : 'Pre-existing columns and rows preserved: PASS');
    console.log(JSON.stringify(Object.fromEntries(Object.entries(snapshot).map(([table, entry]) => [table, entry.count]))));
  } finally { await client.end(); }
}
main().catch(() => { console.error('Migration preservation failed; connection details and row values suppressed.'); process.exitCode = 1; });
