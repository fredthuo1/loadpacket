import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicAccountRoutes } from "./lib/auth/types";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  // Only the landing page and its reviewed, immutable public media bypass auth.
  if ([
    "/welcome",
    "/marketing/loadpacket/road-ahead.webp",
    "/marketing/loadpacket/loadpacket-overview.mp4",
    "/marketing/loadpacket/overview-captions.vtt",
  ].includes(request.nextUrl.pathname)) return response;
  if (request.nextUrl.pathname === "/broker/t") {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const login = publicAccountRoutes.includes(request.nextUrl.pathname);
  if (request.nextUrl.pathname.startsWith("/auth/"))
    response.headers.set("Referrer-Policy", "no-referrer");
  const redirectToLogin = () => {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    for (const name of ["cache-control", "pragma", "expires"]) {
      const value = response.headers.get(name);
      if (value) redirect.headers.set(name, value);
    }
    return redirect;
  };
  if (!url || !key) return login ? response : redirectToLogin();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values, headers) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        if (headers)
          Object.entries(headers).forEach(([name, value]) =>
            response.headers.set(name, value),
          );
        response.headers.set("Cache-Control", "private, no-store");
        if (request.nextUrl.pathname.startsWith("/auth/"))
          response.headers.set("Referrer-Policy", "no-referrer");
      },
    },
  });
  try {
    const { data, error } = await supabase.auth.getClaims();
    if ((!data?.claims || error) && !login) return redirectToLogin();
  } catch {
    if (!login) return redirectToLogin();
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
