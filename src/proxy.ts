import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths reachable without an account: landing, login, auth callbacks, sitter links, webhooks.
const PUBLIC_PATHS = ["/login", "/auth", "/sit", "/api/sit", "/api/telegram", "/api/cron", "/icons", "/manifest.webmanifest", "/sw.js"];

/**
 * Per-request Content Security Policy with a script nonce (Next.js applies it to its own
 * scripts). Inline style attributes stay allowed: charts and the camera overlay use them.
 */
function contentSecurityPolicy(nonce: string) {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${supabase}`,
    `connect-src 'self' ${supabase}${dev ? " ws:" : ""}`,
    "font-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  let response = next();
  // Not connected to Supabase yet (fresh checkout): let pages render their signed-out state.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = next();
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Refreshes the session cookie when needed. Optimistic gate only; pages re-check auth.
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!data?.claims && !isPublic) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
