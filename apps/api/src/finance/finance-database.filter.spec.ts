import type { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { FinanceDatabaseFilter } from './finance-database.filter';

describe('Finance database errors', () => {
  function respond(code: string, meta?: Record<string, unknown>) {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    new FinanceDatabaseFilter().catch(
      new Prisma.PrismaClientKnownRequestError(
        'Private SQL and connection details',
        { code, meta, clientVersion: '7.10.0' },
      ),
      host,
    );
    return response;
  }
  it.each([
    ['P2021', { table: 'financial_import_batches' }],
    ['P2010', { code: '42P01' }],
    ['P2010', { driverAdapterError: { cause: { originalCode: '42P01' } } }],
  ])(
    'returns an actionable setup response for missing schema (%s)',
    (code, meta) => {
      const response = respond(code, meta);
      expect(response.status).toHaveBeenCalledWith(503);
      expect(response.json).toHaveBeenCalledWith({
        statusCode: 503,
        code: 'FINANCE_SETUP_REQUIRED',
        message:
          'Finance is not enabled in this environment yet. Contact your administrator to complete setup.',
        error: 'Service Unavailable',
      });
    },
  );
  it.each([
    ['P2002', 409],
    ['P2025', 404],
    ['P2010', 500],
  ])('preserves existing responses for other errors (%s)', (code, status) => {
    const response = respond(code, {
      driverAdapterError: { cause: { originalCode: '42601' } },
    });
    expect(response.status).toHaveBeenCalledWith(status);
    expect(JSON.stringify(response.json.mock.calls)).not.toContain(
      'Private SQL',
    );
    expect(JSON.stringify(response.json.mock.calls)).not.toContain(
      'FINANCE_SETUP_REQUIRED',
    );
  });
});
