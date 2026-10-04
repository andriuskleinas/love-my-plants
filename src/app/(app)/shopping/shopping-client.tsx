"use client";

import { callApi } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Item = { id: string; item: string; reason: string | null; status: "open" | "bought" | "dismissed"; plantNickname: string | null };

export function ItemList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [state, setState] = useState(() => new Map(items.map((i) => [i.id, i.status])));
  const [error, setError] = useState<string | null>(null);

  async function set(id: string, status: Item["status"]) {
    const before = new Map(state);
    setState(new Map(state).set(id, status));
    setError(null);
    const res = await callApi(`/api/shopping/${id}`, { method: "PATCH", json: { status } });
    if (!res.ok) {
      setState(before);
      setError(res.error);
    } else if (status === "dismissed") router.refresh();
  }

  if (!items.length) return <p className="mt-6 rounded-2xl bg-leaf-soft p-4 text-sm">Nothing on your list yet.</p>;
  return (
    <>
    {error && (
      <p role="alert" className="mt-6 text-sm text-bad">
        {error}
      </p>
    )}
    <ul className="mt-6 space-y-2">
      {items.map((i) => {
        const bought = state.get(i.id) === "bought";
        return (
          <li key={i.id} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3 text-sm">
            <input
              type="checkbox"
              checked={bought}
              onChange={() => set(i.id, bought ? "open" : "bought")}
              aria-label={`Bought ${i.item}`}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--leaf)]"
            />
            <div className="min-w-0 flex-1">
              <p className={bought ? "text-muted line-through" : "font-medium"}>{i.item}</p>
              {(i.plantNickname || i.reason) && (
                <p className="text-muted">{[i.plantNickname, i.reason].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            {!bought && (
              <button onClick={() => set(i.id, "dismissed")} aria-label={`Remove ${i.item}`} className="px-1 text-muted">
                ✕
              </button>
            )}
          </li>
        );
      })}
    </ul>
    </>
  );
}

export function AddItem() {
  const router = useRouter();
  const [item, setItem] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!item.trim()) return;
    setBusy(true);
    setError(null);
    const res = await callApi("/api/shopping", { method: "POST", json: { item } });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setItem("");
    router.refresh();
  }

  return (
    <>
    <form onSubmit={add} className="mt-3 flex gap-2">
      <label htmlFor="new-item" className="sr-only">
        Add an item
      </label>
      <input
        id="new-item"
        value={item}
        maxLength={80}
        onChange={(e) => setItem(e.target.value)}
        placeholder="Add something…"
        className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-leaf"
      />
      <button disabled={busy || !item.trim()} className="rounded-xl bg-leaf px-4 font-medium text-background disabled:opacity-40">
        Add
      </button>
    </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </>
  );
}

export function AddSuggestions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setError(null);
        const res = await callApi("/api/shopping", { method: "POST", json: { suggestions: true } });
        setBusy(false);
        if (!res.ok) return setError(res.error);
        router.refresh();
      }}
      className="mt-3 rounded-full bg-leaf px-4 py-2 font-medium text-background disabled:opacity-50"
    >
      Add these to my list
    </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </>
  );
}
