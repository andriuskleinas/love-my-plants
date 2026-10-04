"use client";

import { callApi } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function JoinButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    const res = await callApi("/api/circle/join", { method: "POST", json: { token } });
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
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
