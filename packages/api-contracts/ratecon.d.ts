export type DraftRequirementType =
  "BOL" | "POD" | "CARRIER_INVOICE" | "LUMPER_RECEIPT" | "SCALE_TICKET";
export type DraftRequirement = {
  type: DraftRequirementType;
  documentType: DraftRequirementType;
  requirement: "REQUIRED" | "CONDITIONAL";
  confidence: number;
};
export type DraftStop = {
  facilityName: string | null;
  address: string;
  appointment: string | null;
  referenceNumber: string | null;
  /** Source date text; no timezone inference. Additive for older draft consumers. */
  date?: string | null;
};
export type RateConDraft = {
  documentId: string;
  loadNumber: string;
  brokerName: string;
  brokerContact: string | null;
  equipment: string | null;
  currency: string;
  linehaul: string | null;
  fuelSurcharge: string | null;
  totalRate: string;
  pickup: DraftStop;
  delivery: DraftStop;
  requirements: DraftRequirement[];
};
/** Top-level fields are canonical. `draft` is the existing compatibility alias. */
export type RateConDraftResponse = RateConDraft & {
  intelligence?: import('./document-intelligence').DocumentIntelligence;
  draft?: RateConDraft;
  extraction: { pageCount: number | null; characterCount: number };
  reviewRequired: boolean;
  warnings: string[];
};
