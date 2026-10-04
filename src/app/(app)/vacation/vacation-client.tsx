"use client";

import { callApi } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function TripForm() {
  const router = useRouter();
  const today = new Date();
  const [from, setFrom] = useState(toInput(new Date(today.getTime() + 7 * 86_400_000)));
  const [to, setTo] = useState(toInput(new Date(today.getTime() + 14 * 86_400_000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await callApi("/api/vacations", {
      method: "POST",
      // Leave in the morning of the first day, back in the evening of the last.
      json: { startsAt: new Date(`${from}T06:00:00`).toISOString(), endsAt: new Date(`${to}T20:00:00`).toISOString() },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-6 space-y-4 rounded-2xl border border-border bg-surface p-4 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="font-medium">Leaving</span>
          <input type="date" required value={from} min={toInput(today)} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" />
        </label>
        <label>
          <span className="font-medium">Back</span>
          <input type="date" required value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" />
        </label>
      </div>
      {error && <p className="text-bad">{error}</p>}
      <button disabled={busy} className="w-full rounded-full bg-leaf py-2.5 font-medium text-background disabled:opacity-50">
        {busy ? "Saving…" : "Make my prep list"}
      </button>
    </form>
  );
}

export function PrepList({ tripId, items }: { tripId: string; items: { key: string; text: string; done: boolean }[] }) {
  const [done, setDone] = useState(() => new Set(items.filter((i) => i.done).map((i) => i.key)));
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: string) {
    const next = !done.has(key);
    const before = done;
    const optimistic = new Set(done);
    if (next) optimistic.add(key);
    else optimistic.delete(key);
    setDone(optimistic);
    setError(null);
    const res = await callApi(`/api/vacations/${tripId}`, { method: "PATCH", json: { key, done: next } });
    if (!res.ok) {
      setDone(before);
      setError(res.error);
    }
  }

  return (
    <>
    {error && (
      <p role="alert" className="mb-2 text-sm text-bad">
        {error}
      </p>
    )}
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.key} className="rounded-2xl border border-border bg-surface p-3 text-sm">
          <label className="flex cursor-pointer gap-3">
            <input type="checkbox" checked={done.has(i.key)} onChange={() => toggle(i.key)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--leaf)]" />
            <span className={done.has(i.key) ? "text-muted line-through" : ""}>{i.text}</span>
          </label>
        </li>
      ))}
    </ul>
    </>
  );
}

export function CancelTrip({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-10">
      <button
        onClick={async () => {
          if (!window.confirm("Cancel this trip? Your reminders continue as normal.")) return;
          const res = await callApi(`/api/vacations/${tripId}`, { method: "DELETE" });
          if (!res.ok) return setError(res.error);
          router.refresh();
        }}
        className="text-sm text-muted"
      >
        Cancel trip
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
