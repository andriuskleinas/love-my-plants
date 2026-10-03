"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    params.get("error") ? "error" : "idle",
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const redirect = new URL("/auth/confirm", window.location.origin);
    redirect.searchParams.set("next", next);
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirect.toString() },
    });
    setState(error ? "error" : "sent");
  }

  if (state === "sent") {
    return (
      <div className="text-center">
        <p className="text-4xl">📬</p>
        <h1 className="mt-4 text-2xl font-semibold">Check your email</h1>
        <p className="mt-2 text-muted">
          We sent a sign-in link to <b className="text-foreground">{email}</b>. Open it on this device.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-muted">No password. We&apos;ll email you a link.</p>
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
        className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-leaf"
        placeholder="you@example.com"
      />
      {state === "error" && (
        <p role="alert" className="mt-2 text-sm text-bad">
          That didn&apos;t work. Check the address and try again.
        </p>
      )}
      <button
        type="submit"
        disabled={state === "sending"}
        className="mt-4 w-full rounded-full bg-leaf py-3 font-medium text-background disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Email me a link"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-sm text-muted">
        ← Love My Plants
      </Link>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
