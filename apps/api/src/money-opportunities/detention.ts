import { Prisma } from '../generated/prisma/client';
export type DetentionTerms = {
  freeMinutes: number;
  hourlyRate?: string;
  minimumBillableMinutes?: number;
  roundingIncrementMinutes?: number;
  maximumAmount?: string;
};
export function calculateDetention(
  arrivedAt: Date | null,
  departedAt: Date | null,
  terms: DetentionTerms | null,
) {
  if (!arrivedAt || !departedAt || departedAt < arrivedAt) return null;
  const wait = new Prisma.Decimal(departedAt.getTime())
    .minus(arrivedAt.getTime())
    .div(60000)
    .floor();
  // Two hours is a review trigger only, never an assumed contractual entitlement/rate.
  const free = terms?.freeMinutes ?? 120;
  if (wait.lte(free)) return null;
  let billable = wait.minus(free);
  if (terms?.minimumBillableMinutes)
    billable = Prisma.Decimal.max(billable, terms.minimumBillableMinutes);
  if (terms?.roundingIncrementMinutes)
    billable = billable
      .div(terms.roundingIncrementMinutes)
      .ceil()
      .mul(terms.roundingIncrementMinutes);
  let amount = terms?.hourlyRate
    ? billable.mul(terms.hourlyRate).div(60)
    : null;
  if (amount && terms?.maximumAmount)
    amount = Prisma.Decimal.min(amount, terms.maximumAmount);
  // Protect Decimal(12,2) persistence; exceptional contracts remain manual candidates.
  if (amount?.gt('9999999999.99')) amount = null;
  return {
    eligible: true,
    totalWaitMinutes: wait.toNumber(),
    freeMinutes: terms ? free : null,
    reviewThresholdMinutes: terms ? null : 120,
    billableMinutes: terms ? billable.toNumber() : null,
    calculatedAmount: amount?.toFixed(2, Prisma.Decimal.ROUND_HALF_UP) ?? null,
    reason: terms
      ? `${billable.toFixed(0)} billable minutes beyond ${free}-minute free time. Review contract eligibility before approval.`
      : 'Wait exceeded the 120-minute review threshold. Contract free time and rate require review.',
    terms,
  };
}
