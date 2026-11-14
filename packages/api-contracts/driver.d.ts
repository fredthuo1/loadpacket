/** Driver-safe HTTP projections. No broker, rates, settlement, or billing fields. */
export interface ApplicationUser {
  id: string;
  organizationId: string;
  role: string;
  email: string;
  firstName: string;
  lastName: string;
  onboardingRequired?: boolean;
  driver: { id: string; name: string } | null;
}
export type DriverDocumentType =
  "BOL" | "POD" | "LUMPER_RECEIPT" | "SCALE_TICKET";
export interface StopSummary {
  facilityName: string | null;
  address: string;
  appointmentText: string | null;
  referenceNumber: string | null;
}
export interface DriverStop extends StopSummary {
  id: string;
  sequence: number;
  type: "PICKUP" | "DELIVERY";
  arrivedAt: string | null;
  departedAt: string | null;
  allowedAction: "arrive" | "depart" | null;
}
export interface DriverAssignment {
  id: string;
  status: "ASSIGNED" | "ACCEPTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  assignedAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
}
export interface DriverLoadSummary {
  assignment: DriverAssignment;
  load: {
    id: string;
    loadNumber: string;
    status: string;
    equipment: string | null;
    pickup: StopSummary | null;
    delivery: StopSummary | null;
    paperwork: {
      required: { captured: number; total: number };
      optional: { captured: number; total: number };
    };
  };
}
export interface DriverLoadDetail {
  actionToken: string;
  assignment: DriverAssignment;
  load: Omit<DriverLoadSummary["load"], "paperwork"> & {
    stops: DriverStop[];
    requirements: {
      id: string;
      documentType: DriverDocumentType;
      requirement: string;
      status: string;
      reviewReason: string | null;
      documentId?: string | null;
      documentVersionId?: string | null;
    }[];
  };
}
export interface DriverAutopilot {
  driverAction: {
    type: string;
    label: string;
    reason: string;
    blocking: boolean;
    documentType?: DriverDocumentType;
  };
  stopAction: {
    stopId: string;
    action: "arrive" | "depart";
    label: string;
    reason: string;
  } | null;
  deliveryGuard: {
    applicable: boolean;
    canLeave: boolean;
    blockingCount: number;
    message: string;
    blockers: { type: string; message: string }[];
  };
  timeline: { id: string; type: string; label: string; occurredAt: string }[];
}
export interface EventLocation {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  capturedAt?: string;
}

export interface DriverAssignmentHistory { id: string; loadId: string; loadNumber: string; endedAt: string; outcome: string; assignedAt: string; acceptedAt: string | null; completedAt: string | null; }
