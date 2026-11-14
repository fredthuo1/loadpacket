import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const status =
      exception.code === 'P2025'
        ? 404
        : ['P2002', 'P2003', 'P2034', 'P2028'].includes(exception.code)
          ? 409
          : 500;
    const message =
      status === 404
        ? 'Resource was not found.'
        : status === 409
          ? ['P2034', 'P2028'].includes(exception.code)
            ? 'The record changed during this operation. Refresh and retry.'
            : 'The operation conflicts with an existing record.'
          : 'The database operation could not be completed.';
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({
        statusCode: status,
        message,
        error:
          status === 404
            ? 'Not Found'
            : status === 409
              ? 'Conflict'
              : 'Internal Server Error',
      });
  }
}
