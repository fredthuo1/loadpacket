import { validate } from 'class-validator';
import { GenerateInvoiceDto } from './generate-invoice.dto';
import { SubmitBillingDto } from './submit-billing.dto';
import { UpdateCompanyDto } from '../company/update-company.dto';
import { invoiceDueDate, resolveInvoiceTerms } from './invoice-terms';
import { getBusinessDateIso } from './business-date.util';
import { AccountsReceivableService } from './accounts-receivable.service';
import type { PrismaService } from '../database/prisma.service';
import type { LoadEventsService } from '../load-events/load-events.service';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('Invoice terms and calendar policy', () => {
  it.each([
    ['2026-03-08T05:59:59Z', 0, 'DUE_SOON'],
    ['2026-03-08T06:00:00Z', -1, 'OVERDUE'],
  ])('A/R ages by Chicago calendar date at %s', async (now, days, status) => {
    jest.useFakeTimers().setSystemTime(new Date(now));
    try {
      const prisma = {
        carrierInvoice: { findMany: jest.fn().mockResolvedValue([]) },
        loadPayment: { findMany: jest.fn().mockResolvedValue([]) },
        load: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'invoice',
              status: 'INVOICED',
              totalRate: '1234.56',
              amountPaid: '0',
              paymentDueAt: invoiceDueDate(new Date('2026-03-07T23:00:00Z'), 0),
            },
          ]),
        },
      } as unknown as PrismaService;
      const service = new AccountsReceivableService(
        prisma,
        {} as LoadEventsService,
      );
      const result = await service.getDashboard({
        organizationId: 'tenant',
      } as AuthenticatedUser);
      expect(result.invoices[0].daysUntilDue).toBe(days);
      expect(result.invoices[0].agingStatus).toBe(status);
      expect(result.invoices[0].remainingBalance).toBe('1234.56');
    } finally {
      jest.useRealTimers();
    }
  });
  it.each([0, 1, 120, 121, 365])(
    'accepts %i consistently in all public DTOs',
    async (days) => {
      for (const dto of [
        Object.assign(new GenerateInvoiceDto(), { paymentTermsDays: days }),
        Object.assign(new SubmitBillingDto(), {
          recipientName: 'Test',
          paymentTermsDays: days,
        }),
        Object.assign(new UpdateCompanyDto(), {
          defaultPaymentTermsDays: days,
        }),
      ]) {
        expect(await validate(dto)).toEqual([]);
      }
    },
  );
  it.each([-1, 366, 1.5, null, '0'])(
    'rejects invalid terms %s consistently',
    async (days) => {
      for (const dto of [
        Object.assign(new GenerateInvoiceDto(), { paymentTermsDays: days }),
        Object.assign(new SubmitBillingDto(), {
          recipientName: 'Test',
          paymentTermsDays: days,
        }),
        Object.assign(new UpdateCompanyDto(), {
          defaultPaymentTermsDays: days,
        }),
      ]) {
        expect((await validate(dto)).length).toBeGreaterThan(0);
      }
      expect(() => resolveInvoiceTerms(days, 20, 30)).toThrow();
    },
  );
  it('uses explicit, agreed, company, fallback precedence without losing zero', () => {
    expect(resolveInvoiceTerms(0, 10, 45)).toBe(0);
    expect(resolveInvoiceTerms(365, 10, 45)).toBe(365);
    expect(resolveInvoiceTerms(undefined, 0, 45)).toBe(0);
    expect(resolveInvoiceTerms(undefined, null, 0)).toBe(0);
    expect(resolveInvoiceTerms(undefined, null, 45)).toBe(45);
    expect(resolveInvoiceTerms(undefined, null, undefined)).toBe(30);
    expect(() => resolveInvoiceTerms(undefined, -1, 30)).toThrow();
  });
  it.each([
    ['2026-03-08T05:30:00Z', 1, '2026-03-08'],
    ['2026-03-08T07:30:00Z', 1, '2026-03-09'],
    ['2026-11-01T04:30:00Z', 1, '2026-11-01'],
    ['2026-11-01T06:30:00Z', 1, '2026-11-02'],
    ['2026-01-01T02:00:00Z', 0, '2025-12-31'],
    ['2028-02-28T20:00:00Z', 1, '2028-02-29'],
  ])('adds calendar days from %s', (issued, days, expected) => {
    expect(getBusinessDateIso(invoiceDueDate(new Date(issued), days))).toBe(
      expected,
    );
  });
});
