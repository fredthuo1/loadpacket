import { BadRequestException } from '@nestjs/common';
import { getBusinessDateIso } from './business-date.util';

export function validateInvoiceTerms(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 365
  ) {
    throw new BadRequestException(
      'Payment terms must be a whole number from 0 to 365 days. Zero means due on the invoice date.',
    );
  }
  return value;
}

export function resolveInvoiceTerms(
  explicit: unknown,
  agreed: number | null | undefined,
  company: number | null | undefined,
) {
  // Only absence falls through: never silently replace an invalid choice or zero.
  if (explicit !== undefined) return validateInvoiceTerms(explicit);
  return validateInvoiceTerms(agreed ?? company ?? 30);
}

export function invoiceDueDate(issuedAt: Date, terms: number): Date {
  // Calendar date in the established Chicago billing zone, not elapsed 24h periods.
  // Noon UTC is a stable date carrier: it falls on that same Chicago date in both DST regimes.
  const date = new Date(`${getBusinessDateIso(issuedAt)}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + validateInvoiceTerms(terms));
  return date;
}
