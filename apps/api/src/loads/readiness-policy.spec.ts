import { evaluateReadiness } from './readiness-policy';
import type { RequirementStatus } from '../generated/prisma/enums';
describe('Authoritative payment readiness', () => {
  it.each<[RequirementStatus, boolean]>([
    ['MISSING', false],
    ['RECEIVED', false],
    ['REJECTED', false],
    ['ACCEPTED', true],
    ['WAIVED', true],
  ])('required %s readiness is %s', (status, ready) => {
    expect(
      evaluateReadiness([
        { id: 'pod', documentType: 'POD', requirement: 'REQUIRED', status },
      ]).ready,
    ).toBe(ready);
  });
  it('only activates conditional receipts once evidence has been submitted', () => {
    const required = {
      id: 'pod',
      documentType: 'POD' as const,
      requirement: 'REQUIRED' as const,
      status: 'ACCEPTED' as const,
    };
    const conditional = {
      id: 'lumper',
      documentType: 'LUMPER_RECEIPT' as const,
      requirement: 'CONDITIONAL' as const,
      status: 'MISSING' as RequirementStatus,
    };
    expect(evaluateReadiness([required, conditional]).ready).toBe(true);
    for (const status of ['RECEIVED', 'REJECTED'] as const)
      expect(
        evaluateReadiness([required, { ...conditional, status }]).ready,
      ).toBe(false);
    for (const status of ['ACCEPTED', 'WAIVED'] as const)
      expect(
        evaluateReadiness([required, { ...conditional, status }]).ready,
      ).toBe(true);
  });
  it('does not declare an unconfigured load ready and returns actionable review blockers', () => {
    expect(evaluateReadiness([]).ready).toBe(false);
    expect(
      evaluateReadiness([
        {
          id: 'pod',
          documentType: 'POD',
          requirement: 'REQUIRED',
          status: 'RECEIVED',
        },
      ]).blockers,
    ).toEqual([
      {
        requirementId: 'pod',
        type: 'POD',
        status: 'RECEIVED',
        reason: 'Needs review',
      },
    ]);
  });
});
