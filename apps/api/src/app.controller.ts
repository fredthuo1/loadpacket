import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from './database/prisma.service';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @Public()
  getHealth() {
    return {
      status: 'ok',
      service: 'loadpacket-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/database')
  @Public()
  async getDatabaseHealth() {
    try {
      /*
       * This endpoint checks database
       * connectivity only.
       *
       * It must not depend on:
       * - a seeded organization
       * - a specific tenant
       *
       * SELECT 1 is intentionally small and
       * does not expose application data.
       */
      await this.prisma.$queryRaw`
        SELECT 1 AS health_check
      `;

      return {
        status: 'ok',
        database: 'postgresql',
      };
    } catch {
      /*
       * Do not expose database credentials,
       * connection strings or raw driver
       * errors through the health endpoint.
       */
      throw new ServiceUnavailableException(
        'Database connection is unavailable.',
      );
    }
  }
}
