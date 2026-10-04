"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { signInErrorMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD = 8;

// Reached from the password-reset email (via /auth/confirm, which signs you in first).
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`This password is too short. Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    let updateError;
    try {
      ({ error: updateError } = await createClient().auth.updateUser({ password }));
    } catch (e) {
      updateError = e as { code?: string; status?: number; message?: string };
    }
    if (updateError) {
      setError(
        updateError.code === "same_password"
          ? "That's already your password. Choose a different one, or go straight to Today."
          : signInErrorMessage(updateError),
      );
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <Link href="/" className="mb-10 self-center" aria-label="Love My Plants home">
        <Logo size={88} stacked />
      </Link>
      <form onSubmit={onSubmit} className="w-full">
        <h1 className="text-2xl font-semibold">Set a new password</h1>
        <p className="mt-1 text-muted">You&apos;ll use it to sign in from now on.</p>
        <label htmlFor="password" className="mt-6 block text-sm font-medium">
          New password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-leaf"
          placeholder={`At least ${MIN_PASSWORD} characters`}
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-bad">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-full bg-leaf py-3 font-medium text-background disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </main>
  );
}
