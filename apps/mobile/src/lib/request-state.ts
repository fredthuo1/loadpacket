/** Latest-request wins, including blur/unmount. Never publish an older assignment. */
export function requestGeneration() {
  let revision = 0;
  return {
    begin: () => ++revision,
    current: (value: number) => value === revision,
    invalidate: () => {
      revision++;
    },
  };
}

export function assignmentCommand(actionToken: string | undefined) {
  if (!actionToken)
    throw new Error("Refresh this load before taking an action.");
  return { actionToken };
}

export function uploadRetryMatches(
  saved: string | undefined,
  current: string | undefined,
) {
  return !!saved && saved === current;
}

export function canDriverCapture(
  type: string,
  requirementStatus: string,
  assignmentStatus: string,
) {
  return (
    ["BOL", "POD", "LUMPER_RECEIPT", "SCALE_TICKET"].includes(type) &&
    ["MISSING", "REJECTED"].includes(requirementStatus) &&
    ["IN_PROGRESS", "COMPLETED"].includes(assignmentStatus)
  );
}
