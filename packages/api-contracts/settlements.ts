export type SettlementItem = {
  kind: "PER_LOAD" | "FLAT" | "BONUS" | "DEDUCTION" | "ADJUSTMENT";
  loadId?: string;
  amount: string;
  description: string;
};
export type SettlementTotals = {
  gross: string;
  bonuses: string;
  deductions: string;
  adjustments: string;
  net: string;
};
export type SettlementWork = {
  loadId: string;
  loadNumber: string;
  completionEventId: string;
  completedAt: string;
};
export type SettlementView = {
  id: string;
  driverId: string;
  driverName: string;
  kind: string;
  state: string;
  revision: number;
  originalSettlementId: string | null;
  periodStart: string;
  periodEnd: string;
  currency: string;
  totals: SettlementTotals;
  effectiveObligation: string;
  recordedPayments: string;
  remainingPayable: string;
  paymentStatus: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  cancellationReason: string | null;
  items: SettlementItem[];
  work: SettlementWork[];
  documentVersionId: string | null;
  payments: {
    id: string;
    amount: string;
    paymentDate: string;
    method: string;
    reference: string | null;
    createdAt: string;
  }[];
  adjustments: {
    id: string;
    state: string;
    amount: string;
    approvedAt: string | null;
  }[];
  history: { action: string; actorId: string; createdAt: string }[];
};
/** Stable command receipt; GET detail supplies the current complete history. */
export type SettlementReceipt = Omit<
  SettlementView,
  "items" | "work" | "payments" | "adjustments" | "history"
>;
