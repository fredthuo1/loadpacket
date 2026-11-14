"use client";
import { createClient } from "../supabase/client";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";
let refreshing: ReturnType<
  ReturnType<typeof createClient>["auth"]["refreshSession"]
> | null = null;

export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = new URL(
    input.startsWith("/") ? `${API_BASE_URL}${input}` : input,
  );
  const base = new URL(API_BASE_URL);
  if (
    url.origin !== base.origin ||
    !url.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/`)
  ) {
    throw new Error("Invalid API destination.");
  }
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    if (window.location.pathname !== "/login")
      window.location.replace("/login");
    throw new Error("Please sign in to continue.");
  }
  const send = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    // Never set multipart Content-Type: the browser supplies its boundary.
    return fetch(url, { ...init, headers, cache: "no-store" });
  };
  const response = await send(data.session.access_token);
  if (response.status !== 401) return response;
  // Retry once after refresh. Auth rejects the first request before any mutation.
  refreshing ??= supabase.auth.refreshSession().finally(() => {
    refreshing = null;
  });
  const refreshed = await refreshing;
  if (refreshed.error || !refreshed.data.session) {
    if (window.location.pathname !== "/login")
      window.location.replace("/login");
    return response;
  }
  const retried = await send(refreshed.data.session.access_token);
  if (retried.status === 401 && window.location.pathname !== "/login")
    window.location.replace("/login");
  return retried;
}

export async function apiError(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === "object" && "message" in body) {
    const message = body.message;
    if (typeof message === "string") return message;
    if (Array.isArray(message)) return message.join(", ");
  }
  return `Request failed (${response.status}).`;
}
