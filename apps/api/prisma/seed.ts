import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { bootstrapAuth } from './bootstrap-auth';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required.');
}

const organizationId =
  process.env.DEV_ORGANIZATION_ID || '11111111-1111-4111-8111-111111111111';

const driverId =
  process.env.DEV_DRIVER_ID || '22222222-2222-4222-8222-222222222222';

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const existingDriver = await prisma.driver.findUnique({
    where: { id: driverId },
  });
  if (existingDriver && existingDriver.organizationId !== organizationId) {
    throw new Error('Seed driver belongs to a different organization.');
  }
  const organization = await prisma.organization.upsert({
    where: {
      id: organizationId,
    },

    update: {},

    create: {
      id: organizationId,
      name: 'LoadPacket Demo Carrier',
    },
  });

  const driver = await prisma.driver.upsert({
    where: {
      id: driverId,
    },

    // Existing driver data and activation status must survive auth bootstrapping.
    update: {},

    create: {
      id: driverId,
      organizationId,
      firstName: 'Marcus',
      lastName: 'Reed',
      phone: '(314) 555-0188',
      email: 'marcus@loadpacket.example',
      status: 'ACTIVE',
    },
  });

  console.log(`Development organization ready: ${organization.id}`);

  console.log(
    `Development driver ready: ${driver.firstName} ${driver.lastName} (${driver.id})`,
  );
  await bootstrapAuth(prisma, organization.id, driver.id);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);

    await prisma.$disconnect();

    process.exit(1);
  });
