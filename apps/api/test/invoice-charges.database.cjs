// Deliberately independent of application .env and migration commands.
const path = require('node:path');
const fs = require('node:fs');
const target = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.RUN_INVOICE_CHARGE_TESTS !== '1' || target.hostname !== '127.0.0.1' || target.port !== '55439' || target.pathname !== '/loadpacket_finance_verified_test') throw new Error('Explicit isolated invoice test target required.');
const evidence = path.resolve(__dirname, '../../../test-results/invoice-charges');
fs.mkdirSync(evidence, {recursive:true});
process.chdir(evidence);
require('ts-node').register({project:path.resolve(__dirname,'../tsconfig.json'),experimentalResolver:true});
require('./invoice-charges.database.ts');
