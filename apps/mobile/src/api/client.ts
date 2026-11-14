export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
  ) {
    super(message);
  }
}
export interface TokenSource {
  identity(): Promise<string | null>;
  token(): Promise<string | null>;
  refresh(): Promise<string | null>;
  clear(): Promise<void>;
}
async function bounded<T>(
  operation: Promise<T>,
  milliseconds: number,
  expire: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expire();
          reject(
            new ApiError(
              "The request timed out. It may have reached the server. Refresh before retrying.",
            ),
          );
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export function createApiClient(
  baseUrl: string | undefined,
  auth: TokenSource,
  fetcher: typeof fetch = fetch,
) {
  let refreshing: Promise<string | null> | null = null;
  const accessListeners = new Set<() => void>();
  async function request<T>(
    path: string,
    options: { method?: string; body?: unknown; multipart?: FormData } = {},
  ): Promise<T> {
    if (!baseUrl)
      throw new ApiError(
        "The app connection is not configured. Contact your carrier.",
      );
    const identity = await auth.identity();
    let token = await auth.token();
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!identity || (await auth.identity()) !== identity)
        throw new ApiError("Your account changed. Please try again.", 401);
      if (!token) throw new ApiError("Please sign in again.", 401);
      const controller = new AbortController();
      let response: Response;
      let data: unknown;
      try {
        const result = await bounded(
          (async () => {
            const reply = await fetcher(
              `${baseUrl.replace(/\/$/, "")}${path}`,
              {
                method: options.method ?? "GET",
                signal: controller.signal,
                headers: {
                  Authorization: `Bearer ${token}`,
                  ...(!options.multipart && options.body !== undefined
                    ? { "Content-Type": "application/json" }
                    : {}),
                },
                body:
                  options.multipart ??
                  (options.body !== undefined
                    ? JSON.stringify(options.body)
                    : undefined),
              },
            );
            return {
              response: reply,
              data: (await reply.json().catch(() => null)) as unknown,
            };
          })(),
          options.multipart ? 120_000 : 30_000,
          () => controller.abort(),
        );
        response = result.response;
        data = result.data;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          options.method && options.method !== "GET"
            ? "Connection lost. The action may have reached the server. Refresh before retrying."
            : "We couldn't reach LoadPacket. Check your connection and try again.",
        );
      }
      if (response.status === 401) {
        if ((await auth.identity()) !== identity)
          throw new ApiError("Your account changed. Please try again.", 401);
        if (attempt === 0) {
          const currentToken = await auth.token();
          // A concurrent request may already have refreshed the access token.
          if (currentToken && currentToken !== token) {
            token = currentToken;
            continue;
          }
          refreshing ??= bounded(auth.refresh(), 30_000, () => {})
            .catch(() => null)
            .finally(() => {
              refreshing = null;
            });
          token = await refreshing;
          if (token) continue;
        }
        if ((await auth.identity()) === identity) await auth.clear();
        throw new ApiError("Your session expired. Please sign in again.", 401);
      }
      if ((await auth.identity()) !== identity)
        throw new ApiError("Your account changed. Please try again.", 401);
      if (!response.ok) {
        // Revalidate /me and remove mounted private screens on denied operational access.
        // /me itself must not trigger an endless denial/reload loop.
        if (response.status === 403 && path !== "/me")
          accessListeners.forEach((listener) => listener());
        const message =
          data && typeof data === "object" && "message" in data
            ? data.message
            : null;
        throw new ApiError(
          response.status >= 500
            ? "LoadPacket is temporarily unavailable. Please try again."
            : typeof message === "string"
              ? message
              : Array.isArray(message)
                ? message.filter((item) => typeof item === "string").join("\n")
                : "The request could not be completed. Refresh and try again.",
          response.status,
        );
      }
      return data as T;
    }
    throw new ApiError("Please sign in again.", 401);
  }
  return {
    request,
    onAccessDenied(listener: () => void) {
      accessListeners.add(listener);
      return () => {
        accessListeners.delete(listener);
      };
    },
  };
}
