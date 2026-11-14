import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // A relative Location preserves the browser origin behind proxies (and
  // localhost aliases), so the session cookie stays on the same host.
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/auth/invite" },
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const requested = request.nextUrl.searchParams.get("next");
  const target =
    requested === "/auth/reset"
      ? "/auth/reset"
      : type === "signup"
        ? "/auth/start"
        : "/auth/invite";
  response.headers.set("Location", target);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    if (
      !url ||
      !key ||
      !tokenHash ||
      tokenHash.length > 512 ||
      !["invite", "recovery", "signup"].includes(type ?? "")
    )
      throw new Error("invalid");
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values, headers) => {
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          if (headers)
            Object.entries(headers).forEach(([name, value]) =>
              response.headers.set(name, value),
            );
        },
      },
    });
    await supabase.auth.initialize();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "invite" | "recovery" | "signup",
    });
    if (error || !data.session) throw new Error("invalid");
  } catch {
    response.headers.set("Location", `${target}?error=invalid`);
  }
  return response;
}
