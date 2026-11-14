import { defineConfig } from 'prisma/config';
import { billingTestDatasource } from './prisma/billing-test-target';

const datasource = billingTestDatasource(
  process.env.LOADPACKET_BILLING_CONFIG_MODE,
  process.env.LOADPACKET_BILLING_TEST_DATABASE_URL,
);

// Offline mode has no datasource at all, even if DATABASE_URL is set elsewhere.
// The isolated target still needs explicit approval and independent cluster verification.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(datasource ? { datasource } : {}),
});
