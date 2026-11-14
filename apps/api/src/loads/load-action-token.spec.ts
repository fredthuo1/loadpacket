import { digest } from './load-action-token';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CorrectLoadDto } from './load-management.dto';

describe('Load management command contract', () => {
  it('fingerprints equivalent JSON identically and distinguishes conflicting changes', () => {
    expect(digest({ a: 1, nested: { b: 2, c: 3 } })).toBe(
      digest({ nested: { c: 3, b: 2 }, a: 1 }),
    );
    expect(digest({ reason: 'Original' })).not.toBe(
      digest({ reason: 'Different' }),
    );
  });
  it.each([0, 365])(
    'accepts explicit %i-day terms',
    async (paymentTermsDays) => {
      expect(
        await validate(
          plainToInstance(CorrectLoadDto, {
            expectedToken: 'a'.repeat(64),
            idempotencyKey: '00000000-0000-4000-8000-000000000001',
            reason: 'Reviewed correction',
            paymentTermsDays,
          }),
        ),
      ).toHaveLength(0);
    },
  );
  it.each([null, -1, 366, 1.5, '30'])(
    'rejects invalid terms %s',
    async (paymentTermsDays) => {
      expect(
        (
          await validate(plainToInstance(CorrectLoadDto, { paymentTermsDays }))
        ).some((e) => e.property === 'paymentTermsDays'),
      ).toBe(true);
    },
  );
});
