import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

import { config } from 'dotenv';

import { existsSync } from 'node:fs';

import { resolve } from 'node:path';

/*
 * Load the API environment file explicitly.
 *
 * Depending on how pnpm/Nest is started,
 * process.cwd() may be:
 *
 *   C:\Users\User\Documents\loadpacket
 *
 * or:
 *
 *   C:\Users\User\Documents\loadpacket\apps\api
 *
 * Support both.
 */
const envCandidates = [
  resolve(process.cwd(), '.env'),

  resolve(process.cwd(), 'apps', 'api', '.env'),
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    config({
      path: envPath,

      /*
       * Do not replace values that
       * were explicitly provided by
       * the operating system.
       */
      override: false,
    });

    break;
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is required. Expected it in apps/api/.env.',
      );
    }

    const adapter = new PrismaPg({
      connectionString,

      max: 5,

      connectionTimeoutMillis: 5000,

      idleTimeoutMillis: 30000,
    });

    super({
      adapter,
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
