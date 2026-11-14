import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
export const expenseCategories = [
  'Fuel',
  'Driver Pay',
  'Maintenance',
  'Repairs',
  'Tires',
  'Insurance',
  'Truck Payment',
  'Trailer Payment',
  'Tolls',
  'Permits',
  'Licensing / Registration',
  'Parking',
  'Scales / Weigh Stations',
  'Factoring Fees',
  'Broker Fees',
  'Dispatch Fees',
  'ELD / Technology',
  'Subscriptions',
  'Office',
  'Meals / Travel',
  'Lodging',
  'Wash / Cleaning',
  'Roadside Assistance',
  'Taxes / Government Fees',
  'Other',
];
export const incomeCategories = [
  'Linehaul',
  'Fuel Surcharge',
  'Detention',
  'Layover',
  'TONU',
  'Lumper Reimbursement',
  'Accessorial',
  'Other Revenue',
];
export function dateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new BadRequestException('Use dates in YYYY-MM-DD format.');
  const result = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(result.getTime()) ||
    result.toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException('Invalid calendar date.');
  return result;
}
export function money(value: string, signed = false) {
  if (
    !(signed ? /^-?\d{1,10}(\.\d{1,2})?$/ : /^\d{1,10}(\.\d{1,2})?$/).test(
      value,
    )
  )
    throw new BadRequestException(
      'Enter an amount with at most two decimal places.',
    );
  return new Prisma.Decimal(value).toFixed(2);
}
export function csvCell(value: unknown) {
  let text =
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
      ? String(value)
      : '';
  const prefix = [...text].findIndex(
    (c) => c.charCodeAt(0) > 31 && !/\s/.test(c),
  );
  // Signed decimal amounts must remain numeric in accounting exports. A pure
  // decimal cannot invoke a spreadsheet formula; expressions still get escaped.
  if (
    prefix >= 0 &&
    '=+@-'.includes(text[prefix]) &&
    !/^-\d{1,10}(\.\d{1,2})?$/.test(text)
  )
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function csv(headers: string[], rows: unknown[][]) {
  return (
    '\uFEFF' +
    [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  );
}
