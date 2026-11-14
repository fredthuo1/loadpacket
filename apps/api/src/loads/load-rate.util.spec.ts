import { calculateLoadRate } from './load-rate.util';
describe('Load monetary boundary', () => {
  it('adds cents exactly without JavaScript floating point arithmetic', () => {
    expect(calculateLoadRate('0.10', '0.20', '0.30').totalRate.toFixed(2)).toBe(
      '0.30',
    );
  });
  it.each(['10000000000.00', 'Infinity', 'NaN', '1.001', '-0.01'])(
    'rejects unsupported monetary value %s',
    (value) => {
      expect(() => calculateLoadRate(null, null, value)).toThrow();
    },
  );
  it('rejects a sum outside the database precision even if its components fit', () => {
    expect(() => calculateLoadRate('9999999999.99', '0.01')).toThrow(
      'at most 10 whole digits',
    );
  });
});
