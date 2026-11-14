import type { DriverLoadSummary } from "../../../../packages/api-contracts/driver";
export function groupLoads(loads: DriverLoadSummary[]) {
  return {
    Current: loads.filter(
      ({ assignment }) => assignment.status === "IN_PROGRESS",
    ),
    Upcoming: loads.filter(
      ({ assignment }) =>
        assignment.status === "ASSIGNED" || assignment.status === "ACCEPTED",
    ),
    Completed: loads.filter(
      ({ assignment }) => assignment.status === "COMPLETED",
    ),
  };
}
export const documentLabels = {
  BOL: "Bill of Lading",
  POD: "Proof of Delivery",
  LUMPER_RECEIPT: "Lumper Receipt",
  SCALE_TICKET: "Scale Ticket",
};
export const displayStatus = (status: string) => status.replaceAll("_", " ");
