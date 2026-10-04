"use client";

import { useEffect, useState } from "react";
import { MESSAGES } from "@/lib/errors";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/client";

/**
 * "Continue with Google". Shown only once Google is switched on in Supabase Auth, so the
 * button never leads to a dead end while the provider is being set up.
 */
export function GoogleButton({ next, onError }: { next: string; onError: (message: string | null) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => r.json())
      .then((s) => setEnabled(s?.external?.google === true))
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;

  async function start() {
    setBusy(true);
    onError(null);
    const redirect = new URL("/auth/confirm", window.location.origin);
    redirect.searchParams.set("next", safeNext(next, window.location.origin));
    redirect.searchParams.set("via", "google");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirect.toString() },
    });
    // On success the browser is already on its way to Google.
    if (error) {
      setBusy(false);
      onError(navigator.onLine ? "Google sign-in didn't start. Try again, or use your email and password." : MESSAGES.offline);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-border bg-surface py-3 font-medium disabled:opacity-60"
      >
        <GoogleG />
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      <div className="mt-6 flex items-center gap-3 text-sm text-muted" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or use email
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}

/** Google's four-colour "G", as their sign-in branding asks. */
function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
