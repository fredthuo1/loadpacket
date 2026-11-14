export type FieldEvidence = {
  value: string | number | null;
  uncertainty: "UNVERIFIED" | "MISSING" | "CONFLICT" | "DERIVED";
  sources: { page: number; text: string; method: "PDF_TEXT" | "LOCAL_OCR" }[];
  warnings: string[];
  humanState: "UNREVIEWED";
};
export type DocumentIntelligence = {
  runId: string;
  versionId: string;
  checksum: string;
  status: string;
  attemptCount: number;
  retryAllowed: boolean;
  pipeline: string;
  classification: "RATE_CONFIRMATION_CANDIDATE" | "UNKNOWN";
  fields: Record<string, FieldEvidence>;
  pages: { page: number; method: "PDF_TEXT" | "LOCAL_OCR"; text: string }[];
  errorCode: string | null;
  ai: "DISABLED";
};
