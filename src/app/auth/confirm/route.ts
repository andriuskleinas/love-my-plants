import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

// Email-link and "Continue with Google" landing: exchanges the token or code for a session,
// then continues to `next`. `via=google` makes the sign-in page explain Google failures.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), origin);
  const failed = (reason: string) => {
    const url = new URL("/login", origin);
    url.searchParams.set("error", reason);
    if (searchParams.get("via") === "google") url.searchParams.set("via", "google");
    return NextResponse.redirect(url);
  };

  // Supabase sends errors back on the link itself (e.g. error_code=otp_expired).
  const linkError = searchParams.get("error_code") ?? searchParams.get("error");
  if (linkError) return failed(linkError);

  const supabase = await createClient();
  const { error } = tokenHash && type
    ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: Object.assign(new Error("missing token"), { code: "missing" }) };

  if (!error) return NextResponse.redirect(new URL(next, origin));
  const reason = (error as { code?: string }).code ?? (/code verifier/i.test(error.message) ? "pkce" : "link");
  return failed(reason);
}
