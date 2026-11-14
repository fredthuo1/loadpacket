const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const target = new URL(
  process.env.DATABASE_URL || 'postgresql://invalid/invalid',
);
assert.equal(process.env.RUN_LOAD_CORRECTIONS_TESTS, '1');
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55439');
assert.equal(target.pathname, '/loadpacket_finance_verified_test');
const evidence = path.resolve(
  __dirname,
  '../../../test-results/load-corrections',
);
fs.mkdirSync(evidence, { recursive: true });
process.chdir(evidence); // PrismaService cannot discover apps/api/.env here.
(async () => {
  const db = new Client({ connectionString: target.toString() });
  await db.connect();
  try {
    const {
      rows: [identity],
    } = await db.query(
      "SELECT current_database() db, host(inet_server_addr()) host, inet_server_port() port, current_setting('data_directory') dir",
    );
    assert.equal(identity.db, 'loadpacket_finance_verified_test');
    assert.equal(identity.host, '127.0.0.1');
    assert.equal(identity.port, 55439);
    assert.equal(
      path.resolve(identity.dir).toLowerCase(),
      path.resolve(evidence, '../finance-postgres').toLowerCase(),
    );
  } finally {
    await db.end();
  }
  require('ts-node').register({
    project: path.resolve(__dirname, '../tsconfig.json'),
    experimentalResolver: true,
  });
  require('./load-corrections.database.ts');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
