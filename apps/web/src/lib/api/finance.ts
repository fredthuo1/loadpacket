import { apiFetch, apiError } from "./api-fetch";
export type {
  FinanceTransaction,
  FinanceOverview,
  ImportBatch,
} from "../../../../../packages/api-contracts/finance";
export class FinanceSetupRequiredError extends Error {
  constructor() {
    super(
      "Finance is not enabled in this environment yet. Contact your administrator to complete setup.",
    );
    this.name = "FinanceSetupRequiredError";
  }
}
async function financeError(
  response: Response,
  fallback: string,
): Promise<Error> {
  if (response.status < 500) return new Error(await apiError(response));
  if (response.status === 503) {
    const body: unknown = await response.json().catch(() => null);
    if (
      body &&
      typeof body === "object" &&
      "code" in body &&
      body.code === "FINANCE_SETUP_REQUIRED"
    )
      return new FinanceSetupRequiredError();
  }
  // Do not show arbitrary internal database messages from 5xx responses.
  return new Error(fallback);
}
export async function financeRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await apiFetch(`/finance${path}`, init);
  if (!response.ok)
    throw await financeError(
      response,
      "Finance is temporarily unavailable. Please try again or contact your administrator.",
    );
  return response.json() as Promise<T>;
}
export async function financeDownload(path: string, name: string) {
  const response = await apiFetch(`/finance${path}`);
  if (!response.ok)
    throw await financeError(
      response,
      "The export is unavailable. Please try again.",
    );
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function moneyText(value: string | null | undefined) {
  if (value === null || value === undefined) return "Unavailable";
  const [whole, fraction = ""] = value.split(".");
  return `${whole.startsWith("-") ? "-" : ""}$${whole.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}
export function dateRange(preset: string, now = new Date()) {
  const y = now.getUTCFullYear(),
    m = now.getUTCMonth();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const start =
    preset === "lastMonth"
      ? new Date(Date.UTC(y, m - 1, 1))
      : preset === "quarter"
        ? new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1))
        : preset === "year"
          ? new Date(Date.UTC(y, 0, 1))
          : preset === "lastYear"
            ? new Date(Date.UTC(y - 1, 0, 1))
            : new Date(Date.UTC(y, m, 1));
  const end =
    preset === "lastMonth"
      ? new Date(Date.UTC(y, m, 0))
      : preset === "lastYear"
        ? new Date(Date.UTC(y - 1, 11, 31))
        : now;
  return { from: iso(start), to: iso(end) };
}
