import type {
  DocumentType,
  RequirementLevel,
  RequirementStatus,
} from '../generated/prisma/enums';
export type ReadinessRequirement = {
  id: string;
  documentType: DocumentType;
  requirement: RequirementLevel;
  status: RequirementStatus;
};
// Submitting conditional evidence activates that business condition. An untouched
// optional receipt does not block a load. Required documents always apply.
export function requirementApplies(requirement: ReadinessRequirement) {
  return (
    requirement.requirement === 'REQUIRED' || requirement.status !== 'MISSING'
  );
}
export function evaluateReadiness(requirements: ReadinessRequirement[]) {
  const active = requirements.filter(requirementApplies);
  const blockers = active
    .filter((item) => item.status !== 'ACCEPTED' && item.status !== 'WAIVED')
    .map((item) => ({
      requirementId: item.id,
      type: item.documentType,
      status: item.status,
      reason:
        item.status === 'RECEIVED'
          ? 'Needs review'
          : item.status === 'REJECTED'
            ? 'Rejected; replacement required'
            : 'Required document is missing',
    }));
  return {
    ready: active.length > 0 && blockers.length === 0,
    blockers,
    blockingCount: blockers.length,
    requiredCount: active.length,
    satisfiedCount: active.length - blockers.length,
    requirements: requirements.map((item) => ({
      ...item,
      active: requirementApplies(item),
      blocking: blockers.some((blocker) => blocker.requirementId === item.id),
    })),
  };
}
