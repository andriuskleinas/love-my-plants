"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STANDARD_POT_SIZES_CM } from "@/lib/care/repot";

/** "I repotted it": pick the new pot size; the plan and watering amount follow. */
export function RepottedButton({ plantId, currentCm, recommendedCm }: { plantId: string; currentCm: number; recommendedCm: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState(recommendedCm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sizes = STANDARD_POT_SIZES_CM.filter((s) => s >= currentCm && s <= currentCm + 15);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/plants/${plantId}/repotted`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ potDiameterCm: size }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Couldn't save.");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-3 text-sm font-medium text-leaf">
        I repotted it →
      </button>
    );
  }
  return (
    <div className="mt-3 text-sm">
      <p className="text-muted">How wide is the new pot?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {sizes.map((s) => (
          <button
            key={s}
            onClick={() => setSize(s)}
            aria-pressed={size === s}
            className={`rounded-xl border px-3 py-2 ${size === s ? "border-leaf bg-leaf-soft" : "border-border"}`}
          >
            {s} cm
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button disabled={busy} onClick={save} className="rounded-full bg-leaf px-4 py-2 font-medium text-background disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setOpen(false)} className="px-3 text-muted">
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-bad">{error}</p>}
    </div>
  );
}
