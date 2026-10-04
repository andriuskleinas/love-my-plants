"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { BackIcon } from "@/components/icons";
import { linkErrorMessage, oauthErrorMessage, signInErrorMessage } from "@/lib/auth-errors";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/client";
import { GoogleButton } from "./google-button";

type Mode = "signin" | "signup" | "forgot";

const TITLES: Record<Mode, { title: string; sub: string; button: string; busy: string }> = {
  signin: { title: "Sign in", sub: "Welcome back.", button: "Sign in", busy: "Signing in…" },
  signup: { title: "Create your account", sub: "Free. Takes a minute.", button: "Create account", busy: "Creating…" },
  forgot: { title: "Reset your password", sub: "We'll email you a link to set a new one.", button: "Email me a link", busy: "Sending…" },
};

const MIN_PASSWORD = 8;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const linkError = params.get("error");
  const [error, setError] = useState<string | null>(
    linkError ? (params.get("via") === "google" ? oauthErrorMessage(linkError) : linkErrorMessage(linkError)) : null,
  );

  function switchTo(m: Mode) {
    setMode(m);
    setError(null);
    setState("idle");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && password.length < MIN_PASSWORD) {
      setError(`This password is too short. Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setState("busy");
    setError(null);
    const auth = createClient().auth;
    let authError;
    try {
      if (mode === "forgot") {
        const redirect = new URL("/auth/confirm", window.location.origin);
        redirect.searchParams.set("next", "/reset-password");
        ({ error: authError } = await auth.resetPasswordForEmail(email, { redirectTo: redirect.toString() }));
      } else if (mode === "signup") {
        const { data, error } = await auth.signUp({ email, password });
        authError = error;
        // With "Confirm email" off, sign-up signs you in straight away.
        if (!error && !data.session) authError = { message: "", code: "signup_needs_confirmation" };
      } else {
        ({ error: authError } = await auth.signInWithPassword({ email, password }));
      }
    } catch (e) {
      authError = e as { code?: string; status?: number; message?: string };
    }

    if (authError) {
      setError(
        authError.code === "signup_needs_confirmation"
          ? "Your account was created, but it needs email confirmation first. Ask the app owner to turn it off, then sign in."
          : signInErrorMessage(authError),
      );
      setState("idle");
    } else if (mode === "forgot") {
      setState("sent");
    } else {
      router.replace(safeNext(next, window.location.origin));
      router.refresh();
    }
  }

  if (state === "sent") {
    return (
      <div className="text-center">
        <p className="text-4xl">📬</p>
        <h1 className="mt-4 text-2xl font-semibold">Check your email</h1>
        <p className="mt-2 text-muted">
          If there&apos;s an account for <b className="text-foreground">{email}</b>, we sent a link to set a new password. Open it on this device.
        </p>
        <button onClick={() => switchTo("signin")} className="mt-6 font-medium text-leaf">
          Back to sign in
        </button>
      </div>
    );
  }

  const t = TITLES[mode];
  const input = "mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-leaf";
  return (
    <form onSubmit={onSubmit} className="w-full">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="mt-1 text-muted">{t.sub}</p>
      {next !== "/" && next !== "/reset-password" && !error && (
        <p className="mt-3 rounded-xl bg-leaf-soft p-3 text-sm">That page needs you to be signed in. Sign in below and you&apos;ll go straight there.</p>
      )}
      {mode !== "forgot" && <GoogleButton next={next} onError={setError} />}
      <label htmlFor="email" className="mt-6 block text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={input}
        placeholder="you@example.com"
      />
      {mode !== "forgot" && (
        <>
          <div className="mt-4 flex items-baseline justify-between">
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            {mode === "signin" && (
              <button type="button" onClick={() => switchTo("forgot")} className="text-sm text-muted underline-offset-2 hover:underline">
                Forgot password?
              </button>
            )}
          </div>
          <input
            id="password"
            type="password"
            required
            minLength={mode === "signup" ? MIN_PASSWORD : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
            placeholder={mode === "signup" ? `At least ${MIN_PASSWORD} characters` : undefined}
          />
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={state === "busy"}
        className="mt-5 w-full rounded-full bg-leaf py-3 font-medium text-background disabled:opacity-60"
      >
        {state === "busy" ? t.busy : t.button}
      </button>
      <p className="mt-6 text-center text-sm text-muted">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <button type="button" onClick={() => switchTo("signin")} className="font-medium text-leaf">
              Sign in
            </button>
          </>
        ) : mode === "signin" ? (
          <>
            New here?{" "}
            <button type="button" onClick={() => switchTo("signup")} className="font-medium text-leaf">
              Create an account
            </button>
          </>
        ) : (
          <button type="button" onClick={() => switchTo("signin")} className="font-medium text-leaf">
            Back to sign in
          </button>
        )}
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      {/* Installed on a phone there's no browser back button, so the way out is always on the page. */}
      <Link
        href="/"
        className="fixed left-2 top-[max(0.5rem,env(safe-area-inset-top))] flex items-center gap-1 rounded-full py-2 pl-2 pr-3 text-sm text-muted hover:bg-border/60 hover:text-foreground"
      >
        <BackIcon size={18} /> Home
      </Link>
      <Link href="/" className="mb-10 self-center" aria-label="Love My Plants home">
        <Logo size={88} stacked />
      </Link>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
