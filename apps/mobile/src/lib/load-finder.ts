import type { DriverLoadSummary } from "../../../../packages/api-contracts/driver";
import { canUsePro, type SubscriptionState } from "../subscriptions/service";

export type LoadScope = "All" | "Active" | "Completed";
export function findDriverLoads(
  loads: DriverLoadSummary[],
  state: SubscriptionState,
  userId: string | null,
  query: string,
  scope: LoadScope,
) {
  // Loss of entitlement can never hide operational work behind a stale filter.
  if (!canUsePro(state, userId)) return loads;
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return loads.filter(({ load, assignment }) => {
    if (scope === "Completed" && assignment.status !== "COMPLETED")
      return false;
    if (
      scope === "Active" &&
      !["ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(assignment.status)
    )
      return false;
    const text = [
      load.loadNumber,
      ...[load.pickup, load.delivery].flatMap((stop) =>
        stop ? [stop.facilityName, stop.address, stop.referenceNumber] : [],
      ),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
