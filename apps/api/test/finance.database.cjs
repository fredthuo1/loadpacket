// Nest decorator metadata and Prisma generated TS resolution are required.
// Refuse the configured application database, including localhost databases with other names.
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (
  process.env.RUN_FINANCE_DATABASE_TESTS !== '1' ||
  url.hostname !== '127.0.0.1' ||
  url.port !== '55439' ||
  url.pathname !== '/loadpacket_finance_verified_test'
) {
  throw new Error(
    'Finance tests require explicit opt-in and the isolated localhost:55439/loadpacket_finance_verified_test database.',
  );
}
require('ts-node').register({ experimentalResolver: true });
require('./finance.database.ts');
