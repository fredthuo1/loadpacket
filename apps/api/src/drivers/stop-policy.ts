type Stop = {
  id: string;
  sequence: number;
  type: string;
  arrivedAt: Date | null;
  departedAt: Date | null;
};
export function stopActions<T extends Stop>(
  stops: T[],
  loadStatus: string,
  assignmentStatus: string,
) {
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  const active =
    loadStatus === 'IN_TRANSIT' && assignmentStatus === 'IN_PROGRESS';
  const next = ordered.find((stop) => !stop.departedAt);
  return ordered.map((stop) => ({
    ...stop,
    allowedAction:
      active && stop.id === next?.id
        ? stop.arrivedAt
          ? ('depart' as const)
          : ('arrive' as const)
        : null,
  }));
}
export function nextStopAction(
  stops: (Stop & { allowedAction: 'arrive' | 'depart' | null })[],
) {
  const stop = stops.find((item) => item.allowedAction);
  if (!stop?.allowedAction) return null;
  const place = stop.type === 'PICKUP' ? 'pickup' : 'delivery';
  return {
    stopId: stop.id,
    action: stop.allowedAction,
    label: `${stop.allowedAction === 'arrive' ? 'Record arrival at' : 'Record departure from'} ${place}`,
    reason: `Confirm stop ${stop.sequence} when you ${stop.allowedAction === 'arrive' ? 'arrive' : 'depart'}. Location is optional.`,
  };
}
