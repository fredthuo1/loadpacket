import { Catch } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client';
import { PrismaExceptionFilter } from '../common/filters/prisma-exception.filter';

/** Scoped to Finance: other workflows retain their existing error contracts. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class FinanceDatabaseFilter extends PrismaExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    let sqlState: unknown = exception.meta?.code;
    // Prisma's PostgreSQL adapter nests SQLSTATE under the adapter cause.
    const adapter = exception.meta?.driverAdapterError;
    if (adapter && typeof adapter === 'object' && 'cause' in adapter) {
      const cause = adapter.cause;
      if (cause && typeof cause === 'object' && 'originalCode' in cause)
        sqlState = cause.originalCode;
    }
    if (
      exception.code === 'P2021' ||
      (exception.code === 'P2010' && sqlState === '42P01')
    ) {
      host.switchToHttp().getResponse<Response>().status(503).json({
        statusCode: 503,
        code: 'FINANCE_SETUP_REQUIRED',
        message:
          'Finance is not enabled in this environment yet. Contact your administrator to complete setup.',
        error: 'Service Unavailable',
      });
      return;
    }
    super.catch(exception, host);
  }
}
