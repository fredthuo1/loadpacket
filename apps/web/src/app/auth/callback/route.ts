import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("next");
  const next = ["/auth/start", "/auth/staff", "/auth/reset"].includes(
    requested ?? "",
  )
    ? requested!
    : "/auth/start";
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: next,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      code = request.nextUrl.searchParams.get("code");
    if (!url || !key || !code || code.length > 2048) throw new Error();
    const client = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) =>
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          ),
      },
    });
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw new Error();
  } catch {
    response.headers.set("Location", `${next}?error=invalid`);
  }
  return response;
}
