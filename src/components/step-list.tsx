"use client";

import { callApi } from "@/lib/api-client";
import { useState } from "react";

export interface StepItem {
  index: number;
  step: string;
  why: string;
  done: boolean;
}

/** The AI's "Today" steps for one plant, tickable. Ticks are saved as care events. */
export function StepList({ plantId, assessmentId, items }: { plantId: string; assessmentId: string; items: StepItem[] }) {
  const [done, setDone] = useState(() => new Set(items.filter((i) => i.done).map((i) => i.index)));
  const [error, setError] = useState<string | null>(null);

  async function toggle(index: number) {
    const next = !done.has(index);
    const optimistic = new Set(done);
    if (next) optimistic.add(index);
    else optimistic.delete(index);
    setDone(optimistic);
    setError(null);

    const res = await callApi(`/api/plants/${plantId}/steps`, { method: "POST", json: { assessmentId, index, done: next } });
    if (!res.ok) {
      setDone(done); // roll back
      setError(res.error);
    }
  }

  return (
    <div>
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
                <span className={checked ? "text-muted line-through" : "font-medium"}>{item.step}</span>
              </label>
              {item.why && !checked && (
                <details className="ml-8 mt-1 text-sm text-muted">
                  <summary className="cursor-pointer select-none">Why?</summary>
                  <p className="mt-1">{item.why}</p>
                </details>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
