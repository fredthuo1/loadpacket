import {
  settlementDay,
  settlementPeriod,
  settlementTotals,
} from './settlements-domain';
describe('settlement compensation policy', () => {
  it('uses exact cents and separates base, bonus and deduction', () => {
    expect(
      settlementTotals(
        [
          {
            kind: 'PER_LOAD',
            loadId: 'a',
            amount: '0.10',
            description: 'Work',
          },
          { kind: 'BONUS', amount: '0.20', description: 'Bonus' },
          { kind: 'DEDUCTION', amount: '0.01', description: 'Deduction' },
        ],
        ['a'],
      ),
    ).toEqual({
      gross: '0.10',
      bonuses: '0.20',
      deductions: '0.01',
      adjustments: '0.00',
      net: '0.29',
    });
  });
  it.each(['0', '-1', '0.001', '10000000000', 'NaN', 'Infinity'])(
    'rejects invalid base amount %s',
    (amount) => {
      expect(() =>
        settlementTotals(
          [{ kind: 'FLAT', amount, description: 'Work' }],
          ['a'],
        ),
      ).toThrow();
    },
  );
  it('rejects duplicate/missing work and mixed compensation', () => {
    expect(() =>
      settlementTotals(
        [{ kind: 'FLAT', amount: '1', description: 'Work' }],
        ['a', 'a'],
      ),
    ).toThrow();
    expect(() =>
      settlementTotals(
        [{ kind: 'PER_LOAD', loadId: 'a', amount: '1', description: 'Work' }],
        ['a', 'b'],
      ),
    ).toThrow();
    expect(() =>
      settlementTotals(
        [
          { kind: 'PER_LOAD', loadId: 'a', amount: '1', description: 'Work' },
          { kind: 'FLAT', amount: '1', description: 'Work' },
        ],
        ['a'],
      ),
    ).toThrow();
  });
  it('allows signed adjustments but not a new work claim or zero net', () => {
    expect(
      settlementTotals(
        [{ kind: 'ADJUSTMENT', amount: '-12.34', description: 'Correction' }],
        [],
        true,
      ).net,
    ).toBe('-12.34');
    expect(() =>
      settlementTotals(
        [{ kind: 'ADJUSTMENT', amount: '1', description: 'Correction' }],
        ['a'],
        true,
      ),
    ).toThrow();
    expect(() =>
      settlementTotals(
        [{ kind: 'ADJUSTMENT', amount: '1', description: ' ' }],
        [],
        true,
      ),
    ).toThrow();
  });
  it('uses valid calendar periods and Chicago completion days', () => {
    expect(() => settlementPeriod('2026-02-30', '2026-03-01')).toThrow();
    expect(() => settlementPeriod('2026-11-01', '2026-10-31')).toThrow();
    expect(settlementDay(new Date('2026-10-01T02:00:00Z'))).toBe('2026-09-30');
  });
});
