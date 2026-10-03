"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function JoinButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    const res = await fetch("/api/circle/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(json.error ?? "Couldn't join.");
    }
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <button onClick={join} disabled={busy} className="mt-8 w-full rounded-full bg-leaf py-3 font-medium text-background disabled:opacity-50">
        {busy ? "Joining…" : "Join"}
      </button>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
    </>
  );
}
