/**
 * Pure billing policy, intentionally NOT wired into guards/controllers.
 * All inputs must come from authenticated identity, server-owned subscription/
 * trial history, plan configuration and authorized assignment/usage queries.
 * This function cannot authenticate a snapshot: NEVER bind its input to a DTO,
 * client payment claim or unverified provider payload. billingAllowed is only
 * an additional gate, never a replacement for role/tenant/document/assignment
 * authorization. In particular, historical finance access does not grant a
 * Driver permission to read financial records.
 *
 * Time is injected UTC epoch milliseconds. Intervals are [start, end).
 * Paid monthly/annual calendar boundaries are supplied by the server; do not
 * approximate a month/year with a fixed day count. A trial is exactly 14 days;
 * grace is seven days from the FIRST failure in a continuous failure episode.
 * Neither retrying payment nor evaluating this policy resets those clocks.
 *
 * Persistence must enforce one subscription per organization, immutable first
 * trial history, monotonic enrollment (no return to grandfathered), authoritative
 * billing transitions and atomic quota reservations. This evaluator writes
 * nothing and cannot enforce uniqueness, trial claims or concurrent quotas.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_MS = 14 * DAY_MS;
export const GRACE_MS = 7 * DAY_MS;

export type SubscriptionState =
  | 'GRANDFATHERED'
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'EXPIRED'
  | 'UNKNOWN';
export type BillingCadence = 'MONTHLY' | 'ANNUAL';
export type NewOperation = 'LOAD_CREATE' | 'LOAD_ASSIGN' | 'DOCUMENT_PROCESS';
export type OrganizationCapability =
  | NewOperation
  | 'ASSIGNMENT_CONTINUE'
  | 'DOCUMENT_HISTORY_READ'
  | 'FINANCIAL_HISTORY_READ'
  | 'BILLING_MANAGE';

export interface OrganizationSubscriptionSnapshot {
  readonly organizationId: string;
  /** Unknown persisted values fail closed instead of being treated as active. */
  readonly state: string;
  readonly enrolledAtMs: number | null;
  readonly planId: string | null;
  readonly cadence: BillingCadence | null;
  readonly firstTrialStartedAtMs: number | null;
  readonly paidPeriodStartedAtMs: number | null;
  readonly paidPeriodEndsAtMs: number | null;
  readonly firstPaymentFailedAtMs: number | null;
  readonly cancelAtPeriodEnd: boolean;
}

export interface OrganizationPlan {
  readonly id: string;
  /** Missing capability = disabled; null limit = explicitly unlimited.
   * A finite limit counts server-defined units in a server-defined window.
   * No monetary values, provider prices, reset periods or overages are inferred.
   */
  readonly capabilities: Readonly<
    Partial<Record<NewOperation, { readonly limit: number | null }>>
  >;
}

export interface EntitlementRequest {
  readonly organizationId: string;
  readonly actor: Readonly<{ organizationId: string; role: string }>;
  readonly subscription: OrganizationSubscriptionSnapshot | null;
  readonly plan: OrganizationPlan | null;
  readonly nowMs: number;
  readonly capability: OrganizationCapability;
  readonly usage?: Readonly<{ used: number; requested: number }>;
  /** Supplied only AFTER existing assignment/generation/Driver authorization.
   * entitledWhenAssigned must be proven by server history, not a client flag.
   */
  readonly assignment?: Readonly<{
    organizationId: string;
    assignedAtMs: number;
    entitledWhenAssigned: boolean;
  }>;
}

export type EntitlementReason =
  | 'ENTITLED'
  | 'GRANDFATHERED'
  | 'HISTORY_PRESERVED'
  | 'CONTINUATION_PRESERVED'
  | 'OWNER_BILLING'
  | 'OWNER_REQUIRED'
  | 'TENANT_MISMATCH'
  | 'INVALID_TIME'
  | 'UNKNOWN_SUBSCRIPTION'
  | 'INVALID_SUBSCRIPTION'
  | 'ACCESS_EXPIRED'
  | 'PLAN_UNAVAILABLE'
  | 'CAPABILITY_DISABLED'
  | 'INVALID_LIMIT'
  | 'USAGE_REQUIRED'
  | 'LIMIT_EXCEEDED'
  | 'ASSIGNMENT_REQUIRED'
  | 'UNKNOWN_CAPABILITY';

export interface EntitlementDecision {
  readonly billingAllowed: boolean;
  readonly reason: EntitlementReason;
  /** Current new-operation access boundary; null is NOT proof of access. */
  readonly accessEndsAtMs: number | null;
}

const timestamp = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 8_640_000_000_000_000;
const count = (value: number) => Number.isSafeInteger(value) && value >= 0;
const decision = (
  billingAllowed: boolean,
  reason: EntitlementReason,
  accessEndsAtMs: number | null = null,
): EntitlementDecision => ({ billingAllowed, reason, accessEndsAtMs });

function accessWindow(
  subscription: OrganizationSubscriptionSnapshot | null,
  nowMs: number,
): EntitlementDecision {
  if (!subscription) return decision(false, 'UNKNOWN_SUBSCRIPTION');
  const s = subscription;
  if (s.state === 'GRANDFATHERED') {
    return s.enrolledAtMs === null &&
      s.firstTrialStartedAtMs === null &&
      s.paidPeriodStartedAtMs === null &&
      s.paidPeriodEndsAtMs === null &&
      s.firstPaymentFailedAtMs === null
      ? decision(true, 'GRANDFATHERED')
      : decision(false, 'INVALID_SUBSCRIPTION');
  }
  if (!timestamp(s.enrolledAtMs) || s.enrolledAtMs > nowMs)
    return decision(false, 'INVALID_SUBSCRIPTION');
  if (s.state === 'EXPIRED') return decision(false, 'ACCESS_EXPIRED');
  let end: number;
  if (s.state === 'TRIALING') {
    if (
      !timestamp(s.firstTrialStartedAtMs) ||
      s.firstTrialStartedAtMs < s.enrolledAtMs ||
      s.firstTrialStartedAtMs > nowMs ||
      !timestamp(s.firstTrialStartedAtMs + TRIAL_MS)
    )
      return decision(false, 'INVALID_SUBSCRIPTION');
    end = s.firstTrialStartedAtMs + TRIAL_MS;
  } else if (['ACTIVE', 'PAST_DUE', 'CANCELED'].includes(s.state)) {
    const unpaidFailure =
      s.state === 'PAST_DUE' &&
      !s.cancelAtPeriodEnd &&
      s.paidPeriodStartedAtMs === null &&
      s.paidPeriodEndsAtMs === null;
    if (
      !['MONTHLY', 'ANNUAL'].includes(s.cadence ?? '') ||
      (!unpaidFailure &&
        (!timestamp(s.paidPeriodStartedAtMs) ||
          !timestamp(s.paidPeriodEndsAtMs) ||
          s.paidPeriodStartedAtMs < s.enrolledAtMs ||
          s.paidPeriodStartedAtMs > nowMs ||
          s.paidPeriodEndsAtMs <= s.paidPeriodStartedAtMs))
    )
      return decision(false, 'INVALID_SUBSCRIPTION');
    end = s.paidPeriodEndsAtMs ?? 0;
    // Scheduled cancellation never extends a paid term with payment grace.
    if (s.state === 'PAST_DUE' && !s.cancelAtPeriodEnd) {
      if (
        !timestamp(s.firstPaymentFailedAtMs) ||
        s.firstPaymentFailedAtMs < s.enrolledAtMs ||
        s.firstPaymentFailedAtMs > nowMs ||
        !timestamp(s.firstPaymentFailedAtMs + GRACE_MS)
      )
        return decision(false, 'INVALID_SUBSCRIPTION');
      // A failed future renewal must not shorten already-paid access.
      end = Math.max(end, s.firstPaymentFailedAtMs + GRACE_MS);
    }
  } else return decision(false, 'UNKNOWN_SUBSCRIPTION');
  return nowMs < end
    ? decision(true, 'ENTITLED', end)
    : decision(false, 'ACCESS_EXPIRED', end);
}

export function evaluateOrganizationEntitlement(
  input: EntitlementRequest,
): EntitlementDecision {
  const { organizationId, actor, subscription, nowMs, capability } = input;
  if (
    !organizationId ||
    actor.organizationId !== organizationId ||
    (subscription && subscription.organizationId !== organizationId)
  )
    return decision(false, 'TENANT_MISMATCH');
  if (!timestamp(nowMs)) return decision(false, 'INVALID_TIME');
  // Billing recovery and historical access are independent of payment status.
  if (capability === 'BILLING_MANAGE')
    return actor.role === 'OWNER'
      ? decision(true, 'OWNER_BILLING')
      : decision(false, 'OWNER_REQUIRED');
  if (
    capability === 'DOCUMENT_HISTORY_READ' ||
    capability === 'FINANCIAL_HISTORY_READ'
  )
    return decision(true, 'HISTORY_PRESERVED');
  const access = accessWindow(subscription, nowMs);
  if (capability === 'ASSIGNMENT_CONTINUE') {
    const a = input.assignment;
    if (
      !a ||
      a.organizationId !== organizationId ||
      a.entitledWhenAssigned !== true ||
      !timestamp(a.assignedAtMs) ||
      a.assignedAtMs > nowMs ||
      (!access.billingAllowed &&
        access.accessEndsAtMs !== null &&
        a.assignedAtMs >= access.accessEndsAtMs)
    )
      return decision(false, 'ASSIGNMENT_REQUIRED');
    return decision(true, 'CONTINUATION_PRESERVED');
  }
  if (
    capability !== 'LOAD_CREATE' &&
    capability !== 'LOAD_ASSIGN' &&
    capability !== 'DOCUMENT_PROCESS'
  )
    return decision(false, 'UNKNOWN_CAPABILITY');
  if (!access.billingAllowed || access.reason === 'GRANDFATHERED')
    return access;
  const plan = input.plan;
  if (!plan || !plan.id || plan.id !== subscription?.planId)
    return decision(false, 'PLAN_UNAVAILABLE', access.accessEndsAtMs);
  const rule = Object.hasOwn(plan.capabilities, capability)
    ? plan.capabilities[capability]
    : undefined;
  if (!rule)
    return decision(false, 'CAPABILITY_DISABLED', access.accessEndsAtMs);
  if (rule.limit === null) return access;
  if (!count(rule.limit))
    return decision(false, 'INVALID_LIMIT', access.accessEndsAtMs);
  const usage = input.usage;
  if (
    !usage ||
    !count(usage.used) ||
    !count(usage.requested) ||
    usage.requested === 0
  )
    return decision(false, 'USAGE_REQUIRED', access.accessEndsAtMs);
  // Subtraction avoids overflowing a safe integer sum near MAX_SAFE_INTEGER.
  return usage.requested <= rule.limit - usage.used
    ? access
    : decision(false, 'LIMIT_EXCEEDED', access.accessEndsAtMs);
}

/** Only the lifetime trial-reuse check, NOT permission to replace a paid term.
 * Unknown history fails closed. B4.3C must claim an unused trial atomically and
 * retain firstTrialStartedAtMs across cancellation, owner changes and recovery.
 */
export function isOrganizationTrialUnused(
  organizationId: string,
  history: Readonly<{
    organizationId: string;
    firstTrialStartedAtMs: number | null;
  }> | null,
): boolean {
  return (
    !!organizationId &&
    history?.organizationId === organizationId &&
    history.firstTrialStartedAtMs === null
  );
}
