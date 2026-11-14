import { calculateDetention } from './detention';
describe('Detention deterministic calculation', () => {
  const arrival = new Date('2026-09-23T00:00:00Z');
  const departure = (minutes: number) =>
    new Date(arrival.getTime() + minutes * 60000);
  it.each([0, 119, 120])(
    'does not detect %s minutes within free time',
    (minutes) => {
      expect(
        calculateDetention(arrival, departure(minutes), {
          freeMinutes: 120,
          hourlyRate: '150.00',
        }),
      ).toBeNull();
    },
  );
  it('calculates exact money, rounding only once to cents', () => {
    expect(
      calculateDetention(arrival, departure(190), {
        freeMinutes: 120,
        hourlyRate: '150.00',
      }),
    ).toMatchObject({
      totalWaitMinutes: 190,
      billableMinutes: 70,
      calculatedAmount: '175.00',
    });
  });
  it('applies minimum, ceiling increment, then cap', () => {
    expect(
      calculateDetention(arrival, departure(121), {
        freeMinutes: 120,
        hourlyRate: '99.99',
        minimumBillableMinutes: 20,
        roundingIncrementMinutes: 15,
        maximumAmount: '40.00',
      }),
    ).toMatchObject({ billableMinutes: 30, calculatedAmount: '40.00' });
  });
  it('returns a review candidate with no invented free time/rate', () => {
    expect(calculateDetention(arrival, departure(190), null)).toMatchObject({
      freeMinutes: null,
      billableMinutes: null,
      calculatedAmount: null,
    });
    expect(
      calculateDetention(arrival, departure(190), { freeMinutes: 120 }),
    ).toMatchObject({ calculatedAmount: null, billableMinutes: 70 });
  });
  it('rejects missing/reversed stop evidence and floors partial minutes', () => {
    expect(calculateDetention(null, departure(190), null)).toBeNull();
    expect(calculateDetention(arrival, departure(-1), null)).toBeNull();
    expect(
      calculateDetention(arrival, departure(120.99), { freeMinutes: 120 }),
    ).toBeNull();
  });
});
