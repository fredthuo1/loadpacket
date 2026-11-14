import {
  DAY_MS,
  GRACE_MS,
  TRIAL_MS,
  evaluateOrganizationEntitlement as evaluate,
  isOrganizationTrialUnused,
  type EntitlementRequest,
  type OrganizationCapability,
  type OrganizationPlan,
  type OrganizationSubscriptionSnapshot,
} from './entitlement-policy';

const start = Date.parse('2026-01-01T00:00:00Z');
const end = Date.parse('2026-02-01T00:00:00Z');
const plan: OrganizationPlan = {
  id: 'configured-plan',
  capabilities: {
    LOAD_CREATE: { limit: 10 },
    LOAD_ASSIGN: { limit: null },
    DOCUMENT_PROCESS: { limit: 0 },
  },
};
function subscription(
  changes: Partial<OrganizationSubscriptionSnapshot> = {},
): OrganizationSubscriptionSnapshot {
  return {
    organizationId: 'org-a',
    state: 'ACTIVE',
    enrolledAtMs: start,
    planId: plan.id,
    cadence: 'MONTHLY',
    firstTrialStartedAtMs: null,
    paidPeriodStartedAtMs: start,
    paidPeriodEndsAtMs: end,
    firstPaymentFailedAtMs: null,
    cancelAtPeriodEnd: false,
    ...changes,
  };
}
function request(
  changes: Partial<EntitlementRequest> = {},
): EntitlementRequest {
  return {
    organizationId: 'org-a',
    actor: { organizationId: 'org-a', role: 'OWNER' },
    subscription: subscription(),
    plan,
    nowMs: start + DAY_MS,
    capability: 'LOAD_CREATE',
    usage: { used: 9, requested: 1 },
    ...changes,
  };
}
const allowed = (r: EntitlementRequest) => evaluate(r).billingAllowed;

describe('organization entitlement policy (pure, no live enforcement)', () => {
  describe('time, lifecycle and cancellation', () => {
    it.each(['MONTHLY', 'ANNUAL'] as const)(
      'honors supplied %s calendar boundaries, including the exact expiry',
      (cadence) => {
        const periodEnd = cadence === 'ANNUAL' ? start + 365 * DAY_MS : end;
        const s = subscription({ cadence, paidPeriodEndsAtMs: periodEnd });
        expect(allowed(request({ subscription: s, nowMs: start }))).toBe(true);
        expect(
          allowed(request({ subscription: s, nowMs: periodEnd - 1 })),
        ).toBe(true);
        expect(
          evaluate(request({ subscription: s, nowMs: periodEnd })),
        ).toEqual({
          billingAllowed: false,
          reason: 'ACCESS_EXPIRED',
          accessEndsAtMs: periodEnd,
        });
      },
    );
    it('calculates precisely 14 UTC days even across a DST change', () => {
      const trialStart = Date.parse('2026-03-01T06:00:00Z');
      const s = subscription({
        state: 'TRIALING',
        enrolledAtMs: trialStart,
        firstTrialStartedAtMs: trialStart,
        cadence: null,
        paidPeriodStartedAtMs: null,
        paidPeriodEndsAtMs: null,
      });
      expect(allowed(request({ subscription: s, nowMs: trialStart }))).toBe(
        true,
      );
      expect(
        allowed(request({ subscription: s, nowMs: trialStart + TRIAL_MS - 1 })),
      ).toBe(true);
      expect(
        evaluate(request({ subscription: s, nowMs: trialStart + TRIAL_MS })),
      ).toMatchObject({ billingAllowed: false, reason: 'ACCESS_EXPIRED' });
    });
    it('uses the first failure for seven-day grace; reevaluation cannot renew it', () => {
      const s = subscription({
        state: 'PAST_DUE',
        firstPaymentFailedAtMs: end,
      });
      const r = request({ subscription: s, nowMs: end + GRACE_MS - 1 });
      expect(allowed(r)).toBe(true);
      expect(evaluate(r).accessEndsAtMs).toBe(end + 7 * DAY_MS);
      expect(allowed({ ...r, nowMs: end + GRACE_MS })).toBe(false);
      expect(allowed({ ...r, nowMs: end + GRACE_MS + 1 })).toBe(false);
      expect(s.firstPaymentFailedAtMs).toBe(end);
    });
    it('allows grace for a failed initial payment without inventing a paid period', () => {
      const s = subscription({
        state: 'PAST_DUE',
        paidPeriodStartedAtMs: null,
        paidPeriodEndsAtMs: null,
        firstPaymentFailedAtMs: start,
      });
      expect(
        allowed(request({ subscription: s, nowMs: start + GRACE_MS - 1 })),
      ).toBe(true);
      expect(
        allowed(request({ subscription: s, nowMs: start + GRACE_MS })),
      ).toBe(false);
    });
    it('a payment failure cannot shorten an already paid period', () => {
      const s = subscription({
        state: 'PAST_DUE',
        firstPaymentFailedAtMs: start,
      });
      expect(allowed(request({ subscription: s, nowMs: end - 1 }))).toBe(true);
      expect(
        evaluate(request({ subscription: s, nowMs: end })).accessEndsAtMs,
      ).toBe(end);
    });
    it.each(['ACTIVE', 'PAST_DUE', 'CANCELED'])(
      'retains paid access for %s cancellation, then expires without grace',
      (state) => {
        const s = subscription({
          state,
          cancelAtPeriodEnd: true,
          firstPaymentFailedAtMs: end - 1,
        });
        expect(allowed(request({ subscription: s, nowMs: end - 1 }))).toBe(
          true,
        );
        expect(allowed(request({ subscription: s, nowMs: end }))).toBe(false);
      },
    );
    it('canceled snapshots cannot resurrect access even if the flag is absent', () => {
      expect(
        allowed(
          request({
            subscription: subscription({ state: 'CANCELED' }),
            nowMs: end,
          }),
        ),
      ).toBe(false);
    });
    it.each(['UNKNOWN', 'EXPIRED', 'unrecognized-state'])(
      'denies new work for %s, even with future paid dates',
      (state) =>
        expect(
          allowed(request({ subscription: subscription({ state }) })),
        ).toBe(false),
    );
    it('missing subscription is not implicit grandfathering or trial eligibility', () => {
      expect(evaluate(request({ subscription: null })).reason).toBe(
        'UNKNOWN_SUBSCRIPTION',
      );
      expect(isOrganizationTrialUnused('org-a', null)).toBe(false);
    });
    it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER])(
      'rejects invalid injected time %s',
      (nowMs) =>
        expect(evaluate(request({ nowMs })).reason).toBe('INVALID_TIME'),
    );
    it.each([
      { enrolledAtMs: null },
      { enrolledAtMs: end },
      { paidPeriodStartedAtMs: end },
      { paidPeriodEndsAtMs: start },
      { paidPeriodEndsAtMs: NaN },
      { cadence: null },
      { state: 'TRIALING', firstTrialStartedAtMs: null },
      { state: 'TRIALING', firstTrialStartedAtMs: end },
      { state: 'TRIALING', firstTrialStartedAtMs: start - 1 },
      { state: 'PAST_DUE', firstPaymentFailedAtMs: null },
      { state: 'PAST_DUE', firstPaymentFailedAtMs: end },
      { state: 'PAST_DUE', firstPaymentFailedAtMs: start - 1 },
    ] satisfies Partial<OrganizationSubscriptionSnapshot>[])(
      'fails closed for malformed snapshot %j',
      (changes) =>
        expect(
          evaluate(request({ subscription: subscription(changes) })).reason,
        ).toBe('INVALID_SUBSCRIPTION'),
    );
    it('does not use client payment/trial claims or the wall clock', () => {
      const r = {
        ...request({ subscription: null }),
        isPaid: true,
        paymentConfirmed: true,
        trialEndsAtMs: end,
      };
      const clock = jest.spyOn(Date, 'now').mockImplementation(() => {
        throw new Error('Wall clock forbidden');
      });
      try {
        expect(allowed(r)).toBe(false);
        expect(allowed(request())).toBe(true);
        expect(evaluate(request())).toEqual(evaluate(request()));
      } finally {
        clock.mockRestore();
      }
    });
  });

  describe('grandfathering and immutable trial history', () => {
    const grandfathered = subscription({
      state: 'GRANDFATHERED',
      enrolledAtMs: null,
      paidPeriodStartedAtMs: null,
      paidPeriodEndsAtMs: null,
      planId: null,
    });
    it.each(['LOAD_CREATE', 'LOAD_ASSIGN', 'DOCUMENT_PROCESS'] as const)(
      'preserves baseline %s without enrolling or imposing new quotas',
      (capability) =>
        expect(
          evaluate(
            request({ subscription: grandfathered, capability, plan: null }),
          ),
        ).toMatchObject({ billingAllowed: true, reason: 'GRANDFATHERED' }),
    );
    it('cannot grandfather an enrolled or previously trialed organization', () => {
      for (const changes of [
        { enrolledAtMs: start },
        { firstTrialStartedAtMs: start },
        { paidPeriodEndsAtMs: end },
      ]) {
        expect(
          allowed(request({ subscription: { ...grandfathered, ...changes } })),
        ).toBe(false);
      }
      expect(
        allowed(request({ subscription: subscription({ state: 'EXPIRED' }) })),
      ).toBe(false);
    });
    it('allows only explicit unused, same-tenant trial history', () => {
      expect(
        isOrganizationTrialUnused('org-a', {
          organizationId: 'org-a',
          firstTrialStartedAtMs: null,
        }),
      ).toBe(true);
      expect(
        isOrganizationTrialUnused('org-a', {
          organizationId: 'org-b',
          firstTrialStartedAtMs: null,
        }),
      ).toBe(false);
      for (const firstTrialStartedAtMs of [start, 0, NaN]) {
        expect(
          isOrganizationTrialUnused('org-a', {
            organizationId: 'org-a',
            firstTrialStartedAtMs,
          }),
        ).toBe(false);
      }
    });
    it.each(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'])(
      'does not reopen trial eligibility after %s',
      (state) =>
        expect(
          isOrganizationTrialUnused(
            'org-a',
            subscription({ state, firstTrialStartedAtMs: start }),
          ),
        ).toBe(false),
    );
  });

  describe('capabilities, limits and authorization boundary', () => {
    it('permits reaching the limit, not exceeding it', () => {
      expect(allowed(request())).toBe(true);
      expect(
        evaluate(request({ usage: { used: 10, requested: 1 } })).reason,
      ).toBe('LIMIT_EXCEEDED');
      expect(allowed(request({ usage: { used: 8, requested: 2 } }))).toBe(true);
      expect(allowed(request({ usage: { used: 9, requested: 2 } }))).toBe(
        false,
      );
    });
    it('zero means no capacity; null explicitly means unlimited', () => {
      expect(
        allowed(
          request({
            capability: 'DOCUMENT_PROCESS',
            usage: { used: 0, requested: 1 },
          }),
        ),
      ).toBe(false);
      expect(
        allowed(request({ capability: 'LOAD_ASSIGN', usage: undefined })),
      ).toBe(true);
    });
    it('requires matching configured plan and explicitly enabled capability', () => {
      expect(evaluate(request({ plan: null })).reason).toBe('PLAN_UNAVAILABLE');
      expect(
        evaluate(request({ plan: { ...plan, id: 'other-plan' } })).reason,
      ).toBe('PLAN_UNAVAILABLE');
      expect(
        evaluate(request({ plan: { id: plan.id, capabilities: {} } })).reason,
      ).toBe('CAPABILITY_DISABLED');
      expect(
        evaluate(
          request({ capability: 'DRIVER_PRO' as OrganizationCapability }),
        ).reason,
      ).toBe('UNKNOWN_CAPABILITY');
    });
    it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
      'rejects invalid limit %s',
      (limit) => {
        expect(
          evaluate(
            request({
              plan: { id: plan.id, capabilities: { LOAD_CREATE: { limit } } },
            }),
          ).reason,
        ).toBe('INVALID_LIMIT');
      },
    );
    it.each([
      undefined,
      { used: -1, requested: 1 },
      { used: 0, requested: 0 },
      { used: 1.1, requested: 1 },
      { used: 0, requested: Infinity },
    ])('rejects missing/invalid usage %j', (usage) => {
      expect(evaluate(request({ usage })).reason).toBe('USAGE_REQUIRED');
    });
    it('handles safe-integer quota boundaries without rounding overflow', () => {
      const p = {
        id: plan.id,
        capabilities: { LOAD_CREATE: { limit: Number.MAX_SAFE_INTEGER } },
      };
      expect(
        allowed(
          request({
            plan: p,
            usage: { used: Number.MAX_SAFE_INTEGER - 1, requested: 1 },
          }),
        ),
      ).toBe(true);
      expect(
        allowed(
          request({
            plan: p,
            usage: { used: Number.MAX_SAFE_INTEGER, requested: 1 },
          }),
        ),
      ).toBe(false);
    });
    it.each(['OWNER', 'DISPATCHER', 'BACK_OFFICE', 'DRIVER', 'ADMIN'])(
      'restricts billing administration to Owner, including during expiry (%s)',
      (role) =>
        expect(
          allowed(
            request({
              capability: 'BILLING_MANAGE',
              actor: { organizationId: 'org-a', role },
              subscription: null,
            }),
          ),
        ).toBe(role === 'OWNER'),
    );
    it('rejects cross-tenant actor or subscription even for billing/history', () => {
      for (const capability of [
        'LOAD_CREATE',
        'BILLING_MANAGE',
        'DOCUMENT_HISTORY_READ',
        'FINANCIAL_HISTORY_READ',
      ] as const) {
        expect(
          evaluate(
            request({
              capability,
              actor: { organizationId: 'org-b', role: 'OWNER' },
            }),
          ).reason,
        ).toBe('TENANT_MISMATCH');
        expect(
          evaluate(
            request({
              capability,
              subscription: subscription({ organizationId: 'org-b' }),
            }),
          ).reason,
        ).toBe('TENANT_MISMATCH');
      }
    });
  });

  describe('continuity and history during restrictions', () => {
    it.each(['EXPIRED', 'CANCELED', 'PAST_DUE', 'UNKNOWN'])(
      'preserves old assigned work and historical records during %s',
      (state) => {
        const base = request({
          nowMs: end + GRACE_MS,
          actor: { organizationId: 'org-a', role: 'DRIVER' },
          subscription: subscription({ state, firstPaymentFailedAtMs: end }),
          plan: null,
        });
        expect(allowed(base)).toBe(false);
        expect(allowed({ ...base, capability: 'LOAD_ASSIGN' })).toBe(false);
        expect(
          allowed({
            ...base,
            capability: 'ASSIGNMENT_CONTINUE',
            assignment: {
              organizationId: 'org-a',
              assignedAtMs: start,
              entitledWhenAssigned: true,
            },
          }),
        ).toBe(true);
        for (const capability of [
          'DOCUMENT_HISTORY_READ',
          'FINANCIAL_HISTORY_READ',
        ] as const) {
          // Billing does not revoke history; existing role/document guards still apply.
          expect(evaluate({ ...base, capability }).reason).toBe(
            'HISTORY_PRESERVED',
          );
        }
      },
    );
    it('requires server-proven continuation and respects the expiry boundary', () => {
      const r = request({ nowMs: end, capability: 'ASSIGNMENT_CONTINUE' });
      expect(allowed(r)).toBe(false);
      for (const assignment of [
        {
          organizationId: 'org-b',
          assignedAtMs: start,
          entitledWhenAssigned: true,
        },
        {
          organizationId: 'org-a',
          assignedAtMs: start,
          entitledWhenAssigned: false,
        },
        {
          organizationId: 'org-a',
          assignedAtMs: end,
          entitledWhenAssigned: true,
        },
        {
          organizationId: 'org-a',
          assignedAtMs: end + 1,
          entitledWhenAssigned: true,
        },
      ])
        expect(allowed({ ...r, assignment })).toBe(false);
      expect(
        allowed({
          ...r,
          assignment: {
            organizationId: 'org-a',
            assignedAtMs: end - 1,
            entitledWhenAssigned: true,
          },
        }),
      ).toBe(true);
    });
    it('continuation bypasses plan quotas, never new assignment checks', () => {
      const r = request({ plan: null, usage: { used: 999, requested: 1 } });
      expect(allowed(r)).toBe(false);
      expect(
        allowed({
          ...r,
          capability: 'ASSIGNMENT_CONTINUE',
          assignment: {
            organizationId: 'org-a',
            assignedAtMs: start,
            entitledWhenAssigned: true,
          },
        }),
      ).toBe(true);
    });
    it('does not mutate frozen server snapshots, plan or usage', () => {
      const r = Object.freeze(
        request({
          subscription: Object.freeze(subscription()),
          plan: Object.freeze(plan),
          usage: Object.freeze({ used: 9, requested: 1 }),
        }),
      );
      const before = JSON.stringify(r);
      expect(allowed(r)).toBe(true);
      expect(JSON.stringify(r)).toBe(before);
    });
  });
});
