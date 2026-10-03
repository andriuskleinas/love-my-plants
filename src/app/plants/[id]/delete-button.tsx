"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeletePlantButton({ id, nickname }: { id: string; nickname: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!window.confirm(`Delete ${nickname} and all its photos? This can't be undone.`)) return;
    setBusy(true);
    const res = await fetch(`/api/plants/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't delete.");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div>
      <button onClick={onDelete} disabled={busy} className="text-sm text-bad disabled:opacity-50">
        {busy ? "Deleting…" : "Delete plant"}
      </button>
      {error && <p className="mt-1 text-sm text-bad">{error}</p>}
    </div>
  );
}
