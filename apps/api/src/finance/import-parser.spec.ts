import { Workbook } from 'exceljs';
import {
  normalizeRow,
  parseSpreadsheet,
  suggestMapping,
  validateMapping,
} from './import-parser';
import { csvCell, dateOnly, money } from './finance-domain';
describe('Finance imports and precision', () => {
  const headers = [
    'Trip #',
    'Customer',
    'Delivered',
    'Gross',
    'Diesel',
    'Paid',
    'Payment Date',
  ];
  const mapping = suggestMapping(headers);
  it('suggests mapping while allowing explicit overrides', () => {
    expect(mapping).toMatchObject({
      loadNumber: 'Trip #',
      brokerName: 'Customer',
      grossRevenue: 'Gross',
      fuelExpense: 'Diesel',
    });
    expect(validateMapping(mapping, headers)).toEqual(mapping);
    expect(() =>
      validateMapping({ ...mapping, unknown: 'Gross' }, headers),
    ).toThrow();
    expect(() =>
      validateMapping({ ...mapping, fuelSurcharge: 'Gross' }, headers),
    ).toThrow();
  });
  it('parses quoted CSV without dropping invalid rows', async () => {
    const p = await parseSpreadsheet(
      Buffer.from(
        'Load,Broker,Date,Gross\r\nA,"Fictional, Inc",2026-01-01,0.30\r\nB,,bad,bad',
      ),
      'test.csv',
      'text/csv',
    );
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0][1]).toBe('Fictional, Inc');
  });
  it('classifies dates, precision and payment warnings', () => {
    expect(
      normalizeRow(
        [
          'A',
          'Example',
          '2026-09-20',
          '3,450.00',
          '0.10',
          'PAID',
          '2026-09-25',
        ],
        headers,
        mapping,
      ),
    ).toMatchObject({
      status: 'VALID',
      data: { grossRevenue: '3450.00', fuelExpense: '0.10' },
    });
    expect(
      normalizeRow(
        ['A', 'Example', '2026-02-30', '12.001', '', '', ''],
        headers,
        mapping,
      ).status,
    ).toBe('INVALID');
    expect(
      normalizeRow(
        ['A', 'Example', '2026-01-01', '12.00', '', '', ''],
        headers,
        mapping,
      ).status,
    ).toBe('WARNING');
    expect(
      normalizeRow(
        ['A', 'Example', '2026-01-01', '12.00', '', 'PAID', ''],
        headers,
        mapping,
      ).status,
    ).toBe('INVALID');
  });
  it('rejects malformed XLSX and formulas instead of using cached results', async () => {
    await expect(
      parseSpreadsheet(
        Buffer.from('bad'),
        'bad.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).rejects.toThrow();
    const w = new Workbook();
    const s = w.addWorksheet('Records');
    s.addRow(['Load', 'Gross']);
    s.addRow(['A', { formula: '1+2', result: 3 }]);
    await expect(
      parseSpreadsheet(
        Buffer.from(await w.xlsx.writeBuffer()),
        'formula.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).rejects.toThrow('Formulas');
  });
  it('reads actual XLSX dates and decimal cells', async () => {
    const w = new Workbook();
    const s = w.addWorksheet('Records');
    s.addRow(['Load', 'Date', 'Gross']);
    s.addRow(['A', new Date('2026-09-20T00:00:00Z'), 0.3]);
    const p = await parseSpreadsheet(
      Buffer.from(await w.xlsx.writeBuffer()),
      'records.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(p.rows[0]).toEqual(['A', '2026-09-20', '0.3']);
  });
  it('bounds files and rejects duplicate headers', async () => {
    await expect(
      parseSpreadsheet(Buffer.from('A,A\n1,2'), 'records.csv', 'text/csv'),
    ).rejects.toThrow('unique');
    await expect(
      parseSpreadsheet(
        Buffer.alloc(5 * 1024 * 1024 + 1),
        'records.csv',
        'text/csv',
      ),
    ).rejects.toThrow();
  });
  it('keeps calendar dates and money exact', () => {
    expect(money('0.10')).toBe('0.10');
    expect(money('-1.20', true)).toBe('-1.20');
    expect(() => money('1.001')).toThrow();
    expect(() => dateOnly('2026-02-30')).toThrow();
    expect(dateOnly('2026-09-20').toISOString()).toBe(
      '2026-09-20T00:00:00.000Z',
    );
  });
  it('neutralizes formula injection including whitespace prefixes', () => {
    for (const s of ['=1+1', ' +CMD', '\t@SUM(A1)', '-1+2'])
      expect(csvCell(s)).toMatch(/^"'/);
    expect(csvCell('A,"B"')).toBe('"A,""B"""');
  });
  it('preserves signed corrections as numeric CSV amounts', () => {
    expect(csvCell('-12.44')).toBe('"-12.44"');
    expect(csvCell('-1+2')).toBe('"\'-1+2"');
    expect(csvCell('-1E99')).toBe('"\'-1E99"');
  });
});
