"use client";

import { callApi } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RescueOutcome } from "@/lib/care/rescue";

export function RescueSteps({
  plantId,
  items,
}: {
  plantId: string;
  items: { index: number; step: string; done: boolean; late: boolean }[];
}) {
  const [done, setDone] = useState(() => new Set(items.filter((i) => i.done).map((i) => i.index)));
  const [error, setError] = useState<string | null>(null);

  async function toggle(index: number) {
    const next = !done.has(index);
    const before = done;
    const optimistic = new Set(done);
    if (next) optimistic.add(index);
    else optimistic.delete(index);
    setDone(optimistic);
    setError(null);
    const res = await callApi(`/api/plants/${plantId}/rescue`, { method: "PATCH", json: { stepIndex: index, done: next } });
    if (!res.ok) {
      setDone(before);
      setError(res.error);
    }
  }

  return (
    <>
      <ul className="space-y-2">
        {items.map((item) => {
          const checked = done.has(item.index);
          return (
            <li key={item.index} className="rounded-2xl border border-border bg-surface p-3">
              <label className="flex cursor-pointer gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item.index)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--leaf)]"
                />
                <span className={checked ? "text-muted line-through" : "font-medium"}>
                  {item.late && !checked && <span className="text-terracotta">From earlier: </span>}
                  {item.step}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </>
  );
}

const OUTCOMES: { outcome: RescueOutcome; label: string; confirm: string }[] = [
  { outcome: "recovered", label: "🎉 It's recovered", confirm: "End the rescue? Normal care and reminders continue." },
  { outcome: "propagated", label: "🌱 I saved it as cuttings", confirm: "End the rescue? The plant stays in your list." },
  { outcome: "lost", label: "🥀 It didn't make it", confirm: "We're sorry. Remove it from your plants? Its photos and history are kept." },
];

export function EndRescue({ plantId, nickname }: { plantId: string; nickname: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function end(outcome: RescueOutcome, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const res = await callApi(`/api/plants/${plantId}/rescue`, { method: "POST", json: { outcome } });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push(outcome === "lost" ? "/" : `/plants/${plantId}`);
    router.refresh();
  }

  return (
    <details className="mt-8 rounded-2xl border border-border bg-surface text-sm">
      <summary className="cursor-pointer select-none p-4 font-semibold">End the rescue for {nickname}</summary>
      <div className="flex flex-col gap-2 px-4 pb-4">
        {OUTCOMES.map((o) => (
          <button
            key={o.outcome}
            disabled={busy}
            onClick={() => end(o.outcome, o.confirm)}
            className="rounded-xl border border-border px-3 py-2.5 text-left disabled:opacity-50"
          >
            {o.label}
          </button>
        ))}
        {error && (
          <p role="alert" className="text-bad">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
