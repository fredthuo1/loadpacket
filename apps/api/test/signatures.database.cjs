const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.RUN_FINANCE_DATABASE_TESTS !== '1' || url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/loadpacket_finance_verified_test')
  throw new Error('Signature tests require the approved isolated Finance test database and explicit opt-in.');
require('ts-node').register({ experimentalResolver: true });
require('./signatures.database.ts');
