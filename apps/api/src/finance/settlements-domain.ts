import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { dateOnly, money } from './finance-domain';
import type {
  SettlementItem,
  SettlementTotals,
} from '../../../../packages/api-contracts/settlements';

export function settlementPeriod(start: string, end: string) {
  const from = dateOnly(start),
    to = dateOnly(end);
  if (from > to)
    throw new BadRequestException('Period start must not follow its end.');
  return { from, to };
}
export function settlementDay(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
export function settlementTotals(
  items: SettlementItem[],
  loadIds: string[],
  adjustment = false,
): SettlementTotals {
  if (
    !items.length ||
    items.length > 200 ||
    loadIds.length > 100 ||
    new Set(loadIds).size !== loadIds.length
  )
    throw new BadRequestException(
      'Select unique work and at least one compensation item.',
    );
  const totals = {
    gross: new Prisma.Decimal(0),
    bonuses: new Prisma.Decimal(0),
    deductions: new Prisma.Decimal(0),
    adjustments: new Prisma.Decimal(0),
  };
  const selected = new Set<string>();
  let flats = 0;
  for (const item of items) {
    if (!item.description.trim() || item.description.length > 500)
      throw new BadRequestException('Every item requires a description.');
    const amount = new Prisma.Decimal(money(item.amount, adjustment));
    if (amount.eq(0) || (!adjustment && amount.lt(0)))
      throw new BadRequestException(
        'Compensation amounts must be positive; only adjustments may be negative.',
      );
    if (adjustment !== (item.kind === 'ADJUSTMENT'))
      throw new BadRequestException(
        'Adjustment statements contain only signed adjustment items.',
      );
    if (item.kind === 'PER_LOAD') {
      if (
        !item.loadId ||
        !loadIds.includes(item.loadId) ||
        selected.has(item.loadId)
      )
        throw new BadRequestException(
          'Each selected load requires exactly one base pay item.',
        );
      selected.add(item.loadId);
      totals.gross = totals.gross.plus(amount);
    } else {
      if (item.loadId)
        throw new BadRequestException(
          'Only per-load items may specify a load.',
        );
      if (item.kind === 'FLAT') {
        flats++;
        totals.gross = totals.gross.plus(amount);
      } else if (item.kind === 'BONUS')
        totals.bonuses = totals.bonuses.plus(amount);
      else if (item.kind === 'DEDUCTION')
        totals.deductions = totals.deductions.plus(amount);
      else if (item.kind === 'ADJUSTMENT')
        totals.adjustments = totals.adjustments.plus(amount);
      else throw new BadRequestException('Unsupported compensation kind.');
    }
  }
  if (
    adjustment
      ? loadIds.length !== 0
      : !loadIds.length ||
        !(
          (flats === 1 && selected.size === 0) ||
          (flats === 0 && selected.size === loadIds.length)
        )
  )
    throw new BadRequestException(
      'Choose per-load pay or one flat amount for selected completed work.',
    );
  const net = totals.gross
    .plus(totals.bonuses)
    .minus(totals.deductions)
    .plus(totals.adjustments);
  if (
    net.eq(0) ||
    (!adjustment && net.lt(0)) ||
    [net, ...Object.values(totals)].some((v) => v.abs().gt('9999999999.99'))
  )
    throw new BadRequestException(
      'Settlement total is invalid or exceeds the supported amount.',
    );
  return {
    gross: totals.gross.toFixed(2),
    bonuses: totals.bonuses.toFixed(2),
    deductions: totals.deductions.toFixed(2),
    adjustments: totals.adjustments.toFixed(2),
    net: net.toFixed(2),
  };
}

/** Same organization lock as existing Finance posting/import. No application .env access. */
export async function settlementFinanceLock(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId},0))`;
}
export async function guardLegacySettlementPay(
  tx: Prisma.TransactionClient,
  organizationId: string,
  date: Date,
  driverId?: string | null,
  loadId?: string | null,
) {
  if (driverId)
    await tx.$queryRaw`SELECT id FROM drivers WHERE id=${driverId}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`;
  if (loadId)
    await tx.$queryRaw`SELECT id FROM loads WHERE id=${loadId}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`;
  // Unattributed imported pay cannot safely be matched by a name alone.
  const conflicts = await tx.$queryRaw<{ id: string }[]>`
    SELECT s.id FROM driver_settlements s WHERE s.organization_id=${organizationId}::uuid AND s.kind='BASE' AND s.state<>'CANCELLED'
    AND ((${date}::date BETWEEN s.period_start AND s.period_end AND (${driverId ?? null}::uuid IS NULL OR s.driver_id=${driverId ?? null}::uuid))
      OR EXISTS(SELECT 1 FROM driver_settlement_work w WHERE w.organization_id=s.organization_id AND w.settlement_id=s.id AND w.released_at IS NULL AND w.load_id=${loadId ?? null}::uuid)) LIMIT 1`;
  if (conflicts.length)
    throw new ConflictException(
      'Driver pay overlaps settlement-managed work or an ambiguous settlement period. Use the settlement workflow.',
    );
}
