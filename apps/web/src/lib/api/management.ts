export type {
  CompanyProfile,
  DriverProfile,
  DriverSummary,
  DriverInput,
  DriverLoadSummary,
} from "../../../../../packages/api-contracts/company-drivers";
import { apiFetch, apiError } from "./api-fetch";

export async function managementRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await apiFetch(path, {
    method,
    ...(body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  if (!response.ok) throw new Error(await apiError(response));
  return response.json() as Promise<T>;
}
