import type {
  DraftStop,
  RateConDraftResponse,
} from "../../../../../packages/api-contracts/ratecon";

export const INVALID_RATECON_DRAFT =
  "We couldn't prepare this Rate Confirmation for review. Some required load information is missing or invalid. Try again, or upload another RateCon.";
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const textOrNull = (value: unknown) =>
  value === null || typeof value === "string";
const money = (value: unknown) =>
  typeof value === "string" && /^\d{1,10}\.\d{2}$/.test(value);
const strings = (value: unknown) =>
  Array.isArray(value) && value.every((v) => typeof v === "string");
const source = (value: unknown) =>
  record(value) &&
  Number.isInteger(value.page) &&
  Number(value.page) >= 1 &&
  Number(value.page) <= 10 &&
  typeof value.text === "string" &&
  ["PDF_TEXT", "LOCAL_OCR"].includes(String(value.method));
const intelligenceShape = (v: unknown) =>
  record(v) &&
  ["runId", "versionId", "checksum", "pipeline"].every(
    (k) => typeof v[k] === "string" && v[k].length > 0,
  ) &&
  ["SUCCEEDED", "FAILED"].includes(String(v.status)) &&
  Number.isInteger(v.attemptCount) &&
  Number(v.attemptCount) >= 1 &&
  Number(v.attemptCount) <= 2 &&
  typeof v.retryAllowed === "boolean" &&
  textOrNull(v.errorCode) &&
  v.ai === "DISABLED" &&
  ["RATE_CONFIRMATION_CANDIDATE", "UNKNOWN"].includes(
    String(v.classification),
  ) &&
  Array.isArray(v.pages) &&
  v.pages.length <= 10 &&
  v.pages.every(source) &&
  record(v.fields) &&
  Object.keys(v.fields).length > 0 &&
  Object.values(v.fields).every(
    (f) =>
      record(f) &&
      (textOrNull(f.value) ||
        (typeof f.value === "number" && Number.isFinite(f.value))) &&
      ["UNVERIFIED", "MISSING", "CONFLICT", "DERIVED"].includes(
        String(f.uncertainty),
      ) &&
      Array.isArray(f.sources) &&
      f.sources.length <= 6 &&
      f.sources.every(source) &&
      strings(f.warnings) &&
      f.humanState === "UNREVIEWED",
  );
const stop = (value: unknown) =>
  record(value) &&
  textOrNull(value.facilityName) &&
  typeof value.address === "string" &&
  textOrNull(value.appointment) &&
  textOrNull(value.referenceNumber) &&
  (value.date === undefined || textOrNull(value.date));

// Validate the JSON boundary, rather than asserting a nonexistent nested UI model.
export function parseRateConDraft(
  value: unknown,
  documentId: string,
): RateConDraftResponse {
  const types = [
    "BOL",
    "POD",
    "CARRIER_INVOICE",
    "LUMPER_RECEIPT",
    "SCALE_TICKET",
  ];
  const intelligence = record(value) && value.intelligence !== undefined;
  if (
    !record(value) ||
    (intelligence && !intelligenceShape(value.intelligence)) ||
    value.documentId !== documentId ||
    typeof value.loadNumber !== "string" ||
    (!intelligence && !value.loadNumber.trim()) ||
    typeof value.brokerName !== "string" ||
    (!intelligence && !value.brokerName.trim()) ||
    !textOrNull(value.brokerContact) ||
    !textOrNull(value.equipment) ||
    (intelligence
      ? typeof value.currency !== "string"
      : value.currency !== "USD") ||
    !(money(value.totalRate) || (intelligence && value.totalRate === "")) ||
    !(value.linehaul === null || money(value.linehaul)) ||
    !(value.fuelSurcharge === null || money(value.fuelSurcharge)) ||
    !stop(value.pickup) ||
    !stop(value.delivery) ||
    !Array.isArray(value.requirements) ||
    !value.requirements.length ||
    !value.requirements.every(
      (item: unknown) =>
        record(item) &&
        typeof item.documentType === "string" &&
        types.includes(item.documentType) &&
        item.type === item.documentType &&
        ["REQUIRED", "CONDITIONAL"].includes(String(item.requirement)) &&
        typeof item.confidence === "number" &&
        Number.isFinite(item.confidence) &&
        item.confidence >= 0 &&
        item.confidence <= 1,
    ) ||
    !record(value.extraction) ||
    !(
      value.extraction.pageCount === null ||
      (Number.isInteger(value.extraction.pageCount) &&
        Number(value.extraction.pageCount) > 0)
    ) ||
    !Number.isInteger(value.extraction.characterCount) ||
    Number(value.extraction.characterCount) < 0 ||
    typeof value.reviewRequired !== "boolean" ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every((warning: unknown) => typeof warning === "string")
  ) {
    throw new Error(INVALID_RATECON_DRAFT);
  }
  return value as RateConDraftResponse;
}

export function stopAppointment(stop: DraftStop): string {
  return [stop.date, stop.appointment].filter(Boolean).join(" ");
}
