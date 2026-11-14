import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { Workbook, type CellValue } from 'exceljs';
import { fromBuffer, type Entry } from 'yauzl';
import { dateOnly, money } from './finance-domain';
import { Prisma } from '../generated/prisma/client';

export const importFields = [
  'loadNumber',
  'brokerName',
  'origin',
  'destination',
  'deliveryDate',
  'miles',
  'grossRevenue',
  'fuelSurcharge',
  'fuelExpense',
  'driverPay',
  'otherExpenses',
  'invoiceNumber',
  'dueDate',
  'paymentDate',
  'paymentStatus',
  'driverName',
  'truckReference',
] as const;
export type ImportField = (typeof importFields)[number];
export type NormalizedRow = Partial<Record<ImportField, string>>;
export const maxImportRows = 1000;
const fail = () =>
  new BadRequestException(
    'Use a CSV or a single-sheet XLSX with at most 1,000 rows, 40 columns and 5 MB. Formulas, macros and external links are not supported.',
  );
export function suggestMapping(headers: string[]) {
  const aliases: Record<string, string[]> = {
    loadNumber: ['loadnumber', 'load', 'loadid', 'trip', 'tripnumber'],
    brokerName: ['broker', 'customer', 'brokername'],
    deliveryDate: ['deliverydate', 'delivered', 'date'],
    grossRevenue: ['gross', 'grossrevenue', 'revenue', 'totalrate'],
    fuelSurcharge: ['fuelsurcharge', 'fsc'],
    fuelExpense: ['fuelexpense', 'diesel'],
    driverPay: ['driverpay', 'pay'],
    otherExpenses: ['otherexpense', 'otherexpenses'],
    driverName: ['driver', 'drivername'],
    truckReference: ['truck', 'trucknumber'],
    invoiceNumber: ['invoice', 'invoicenumber'],
    paymentStatus: ['paid', 'paymentstatus'],
    dueDate: ['duedate'],
    paymentDate: ['paymentdate', 'paiddate'],
  };
  const result: Record<string, string> = {};
  for (const field of importFields) {
    const found = headers.find((h) =>
      [field.toLowerCase(), ...(aliases[field] ?? [])].includes(
        h.toLowerCase().replace(/[^a-z0-9]/g, ''),
      ),
    );
    if (found) result[field] = found;
  }
  return result;
}
export function validateMapping(
  mapping: Record<string, unknown>,
  headers: string[],
) {
  if (Object.keys(mapping).length > importFields.length)
    throw new BadRequestException('Unsupported column mapping.');
  const values: string[] = [];
  for (const [key, value] of Object.entries(mapping)) {
    if (
      !importFields.includes(key as ImportField) ||
      typeof value !== 'string' ||
      !headers.includes(value)
    )
      throw new BadRequestException(
        'Select existing columns for supported fields.',
      );
    values.push(value);
  }
  if (new Set(values).size !== values.length)
    throw new BadRequestException('Map each source column to only one field.');
  for (const field of [
    'loadNumber',
    'brokerName',
    'deliveryDate',
    'grossRevenue',
  ])
    if (!mapping[field])
      throw new BadRequestException(`Map ${field} before previewing.`);
  return mapping as Record<string, string>;
}
async function inspectZip(bytes: Buffer) {
  await new Promise<void>((resolve, reject) => {
    fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip) return reject(fail());
        let size = 0,
          entries = 0;
        const stop = () => {
          zip.close();
          reject(fail());
        };
        zip.on('error', stop);
        zip.on('end', resolve);
        zip.on('entry', (entry: Entry) => {
          entries++;
          size += entry.uncompressedSize;
          if (
            entries > 512 ||
            size > 20 * 1024 * 1024 ||
            /vbaProject|externalLinks|embeddings/i.test(entry.fileName) ||
            entry.generalPurposeBitFlag & 1
          )
            return stop();
          if (entry.fileName.endsWith('/')) return zip.readEntry();
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream) return stop();
            let actual = 0,
              tail = '';
            stream.on('error', stop);
            stream.on('data', (chunk: Buffer) => {
              actual += chunk.length;
              if (
                actual > entry.uncompressedSize ||
                actual > 20 * 1024 * 1024
              ) {
                stream.destroy();
                return stop();
              }
              if (entry.fileName.endsWith('.xml')) {
                const text = tail + chunk.toString('utf8');
                if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
                  stream.destroy();
                  return stop();
                }
                if (entry.fileName.startsWith('xl/worksheets/'))
                  for (const match of text.matchAll(/\br="([A-Z]+)(\d+)"/g)) {
                    const column = [...match[1]].reduce(
                      (n, c) => n * 26 + c.charCodeAt(0) - 64,
                      0,
                    );
                    if (column > 40 || Number(match[2]) > maxImportRows + 1) {
                      stream.destroy();
                      return stop();
                    }
                  }
                tail = text.slice(-200);
              }
            });
            stream.on('end', () => zip.readEntry());
          });
        });
        zip.readEntry();
      },
    );
  });
}
function cellText(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return String(value);
  if ('richText' in value) return value.richText.map((t) => t.text).join('');
  throw fail();
}
export async function parseSpreadsheet(
  bytes: Buffer,
  fileName: string,
  mime: string,
) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw fail();
  let rows: string[][];
  try {
    if (
      /\.csv$/i.test(fileName) &&
      [
        'text/csv',
        'application/csv',
        'application/vnd.ms-excel',
        'application/octet-stream',
        'text/plain',
      ].includes(mime)
    ) {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      rows = parse(text, {
        bom: true,
        skip_empty_lines: false,
        max_record_size: 64000,
        relax_column_count: true,
      });
    } else if (
      /\.xlsx$/i.test(fileName) &&
      [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream',
      ].includes(mime)
    ) {
      await inspectZip(bytes);
      const workbook = new Workbook();
      await workbook.xlsx.load(new Uint8Array(bytes).buffer);
      const sheets = workbook.worksheets.filter((s) => s.actualRowCount > 0);
      if (
        sheets.length !== 1 ||
        sheets[0].rowCount > maxImportRows + 1 ||
        sheets[0].columnCount > 40
      )
        throw fail();
      rows = [];
      for (let i = 1; i <= sheets[0].rowCount; i++)
        rows.push(
          Array.from({ length: sheets[0].columnCount }, (_, c) =>
            cellText(sheets[0].getRow(i).getCell(c + 1).value),
          ),
        );
    } else throw fail();
  } catch {
    throw fail();
  }
  if (
    rows.length < 2 ||
    rows.length > maxImportRows + 1 ||
    rows.some(
      (r) =>
        r.length > 40 || r.some((c) => c.length > 1000 || c.includes('\0')),
    )
  )
    throw fail();
  const headers = rows[0].map((h) => h.trim());
  if (
    headers.some((h) => !h || h.length > 100) ||
    new Set(headers).size !== headers.length
  )
    throw new BadRequestException(
      'Use unique, nonempty column headers (maximum 100 characters).',
    );
  return { headers, rows: rows.slice(1) };
}
export function normalizeRow(
  raw: string[],
  headers: string[],
  mapping: Record<string, string>,
) {
  const data: NormalizedRow = {};
  const errors: string[] = [];
  const warnings: string[] = [];
  if (raw.length > headers.length)
    errors.push('Row has more cells than headers.');
  for (const [key, column] of Object.entries(mapping))
    data[key as ImportField] = (raw[headers.indexOf(column)] ?? '').trim();
  for (const key of [
    'loadNumber',
    'brokerName',
    'deliveryDate',
    'grossRevenue',
  ] as const)
    if (!data[key]) errors.push(`${key} is required.`);
  for (const [key, value] of Object.entries(data))
    if (
      value &&
      value.length > (['origin', 'destination'].includes(key) ? 300 : 200)
    )
      errors.push(`${key} is too long.`);
  if (
    (data.loadNumber?.length ?? 0) > 100 ||
    (data.invoiceNumber?.length ?? 0) > 100 ||
    (data.truckReference?.length ?? 0) > 100
  )
    errors.push(
      'Load, invoice and truck references must be at most 100 characters.',
    );
  for (const key of ['deliveryDate', 'dueDate', 'paymentDate'] as const)
    if (data[key])
      try {
        dateOnly(data[key]);
      } catch {
        errors.push(`${key}: use a valid YYYY-MM-DD date.`);
      }
  for (const key of [
    'grossRevenue',
    'fuelSurcharge',
    'fuelExpense',
    'driverPay',
    'otherExpenses',
    'miles',
  ] as const)
    if (data[key])
      try {
        // Accept conventional USD display strings, never locale-ambiguous decimal separators.
        const value = data[key].replace(/^\$/, '');
        if (
          value.includes(',') &&
          !/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(value)
        )
          throw new Error();
        data[key] = money(value.replaceAll(',', ''));
        if (key === 'miles' && new Prisma.Decimal(data[key]).gte('100000000'))
          throw new Error();
      } catch {
        errors.push(
          `${key}: enter a nonnegative decimal with at most two places.`,
        );
      }
  if (
    !errors.length &&
    new Prisma.Decimal(data.fuelSurcharge || 0).gt(data.grossRevenue || 0)
  )
    errors.push('Fuel surcharge exceeds gross revenue.');
  const status = (data.paymentStatus ?? '').toUpperCase();
  data.paymentStatus = ['PAID', 'YES', 'TRUE'].includes(status)
    ? 'PAID'
    : ['UNPAID', 'NO', 'FALSE'].includes(status)
      ? 'UNPAID'
      : status === ''
        ? 'UNKNOWN'
        : status;
  if (!['PAID', 'UNPAID', 'UNKNOWN'].includes(data.paymentStatus))
    errors.push(
      'Payment status must be PAID, UNPAID or blank. Partial historical payments require separate reconciliation.',
    );
  if (data.paymentStatus === 'PAID' && !data.paymentDate)
    errors.push('Paid records require a payment date.');
  if (data.paymentStatus !== 'PAID' && data.paymentDate)
    errors.push('Payment date requires PAID status.');
  if (data.paymentStatus === 'UNKNOWN')
    warnings.push('Payment status is unknown; review historical receivables.');
  if (
    !errors.length &&
    data.driverPay &&
    new Prisma.Decimal(data.driverPay).gt(0) &&
    !data.driverName
  )
    warnings.push('Driver pay has no driver reference.');
  return {
    data,
    issues: [...errors, ...warnings],
    status: errors.length ? 'INVALID' : warnings.length ? 'WARNING' : 'VALID',
  };
}
