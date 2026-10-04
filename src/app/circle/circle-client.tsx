"use client";

import { callApi } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Member = {
  id: string;
  name: string;
  role: "owner" | "household" | "sitter";
  isMe: boolean;
  pending: boolean;
  startsAt: string | null;
  endsAt: string | null;
  sitterStatus: "upcoming" | "active" | "ended" | null;
  plants: string[];
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

/** Share sheet on phones, clipboard elsewhere. */
async function shareLink(url: string, text: string): Promise<string> {
  if (navigator.share) {
    try {
      await navigator.share({ title: "Love My Plants", text, url });
      return "Shared!";
    } catch {
      /* cancelled: fall back to copy */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "Link copied. Paste it into any chat.";
  } catch {
    return "The link wasn't copied. Press and hold the link above to copy it.";
  }
}

function LinkBox({ url, text }: { url: string; text: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mt-3 rounded-xl bg-leaf-soft p-3 text-sm">
      <p className="font-medium">Send this link (it&apos;s only shown now):</p>
      <p className="mt-1 break-all font-mono text-xs">{url}</p>
      <button onClick={async () => setMsg(await shareLink(url, text))} className="mt-2 rounded-full bg-leaf px-4 py-1.5 font-medium text-background">
        Share link
      </button>
      {msg && <p className="mt-1 text-muted">{msg}</p>}
    </div>
  );
}

export function CircleMembers({ members }: { members: Member[] }) {
  const router = useRouter();
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function act(id: string, method: "POST" | "PATCH" | "DELETE", confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    const res = await callApi<{ url?: string }>(`/api/circle/${id}`, { method });
    setBusy(null);
    if (!res.ok) return setErrors((e) => ({ ...e, [id]: res.error }));
    if (method === "POST" && res.data.url) setLinks((l) => ({ ...l, [id]: res.data.url! }));
    else router.refresh();
  }

  return (
    <ul className="mt-6 space-y-3">
      {members.map((m) => (
        <li key={m.id} className="rounded-2xl border border-border bg-surface p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold">
                {m.role === "sitter" ? "🧳" : "🏠"} {m.name}
                {m.isMe && <span className="font-normal text-muted"> (you)</span>}
              </p>
              <p className="text-muted">
                {m.role === "owner" && "Owner"}
                {m.role === "household" && (m.pending ? "Household · invite not accepted yet" : "Household")}
                {m.role === "sitter" &&
                  `Plant-sitter · ${fmt(m.startsAt)}–${fmt(m.endsAt)} · ${m.sitterStatus === "active" ? "now" : m.sitterStatus}`}
              </p>
              {m.role === "sitter" && m.plants.length > 0 && <p className="text-muted">🪴 {m.plants.join(", ")}</p>}
            </div>
          </div>

          {!m.isMe && m.role !== "owner" && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {(m.pending || (m.role === "sitter" && m.sitterStatus !== "ended")) && (
                <button disabled={busy === m.id} onClick={() => act(m.id, "POST")} className="font-medium text-leaf">
                  New link
                </button>
              )}
              {m.role === "sitter" && m.sitterStatus !== "ended" && (
                <button disabled={busy === m.id} onClick={() => act(m.id, "PATCH", `End ${m.name}'s access now?`)} className="text-muted">
                  End now
                </button>
              )}
              <button disabled={busy === m.id} onClick={() => act(m.id, "DELETE", `Remove ${m.name} from your Care Circle?`)} className="text-bad">
                Remove
              </button>
            </div>
          )}
          {errors[m.id] && (
            <p role="alert" className="mt-2 text-bad">
              {errors[m.id]}
            </p>
          )}
          {links[m.id] && <LinkBox url={links[m.id]} text={`Here's your Love My Plants link, ${m.name} 🌿`} />}
        </li>
      ))}
    </ul>
  );
}

const toInput = (d: Date) => d.toISOString().slice(0, 10);

export function InviteForm({
  plants,
  initial,
}: {
  plants: { id: string; nickname: string }[];
  initial: { role?: "sitter"; from?: string; to?: string };
}) {
  const router = useRouter();
  const today = new Date();
  const [role, setRole] = useState<"household" | "sitter">(initial.role ?? "household");
  const [name, setName] = useState("");
  const [from, setFrom] = useState(initial.from ?? toInput(today));
  const [to, setTo] = useState(initial.to ?? toInput(new Date(today.getTime() + 7 * 86_400_000)));
  const [chosen, setChosen] = useState<string[]>(plants.map((p) => p.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; name: string } | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body =
      role === "household"
        ? { role, name }
        : {
            role,
            name,
            // Whole days in the inviter's time zone: from 00:00 on the first day to 23:59 on the last.
            startsAt: new Date(`${from}T00:00:00`).toISOString(),
            endsAt: new Date(`${to}T23:59:59`).toISOString(),
            plantIds: chosen,
          };
    const res = await callApi<{ url: string }>("/api/circle", { method: "POST", json: body });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setLink({ url: res.data.url, name });
    setName("");
    router.refresh();
  }

  const chip = (on: boolean) => `rounded-xl border px-3 py-2 text-sm ${on ? "border-leaf bg-leaf-soft" : "border-border"}`;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Invite someone</h2>
      <form onSubmit={invite} className="mt-3 space-y-4 rounded-2xl border border-border bg-surface p-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={role === "household"} onClick={() => setRole("household")} className={chip(role === "household")}>
            <span className="block font-medium">🏠 Household</span>
            <span className="text-xs text-muted">Shares all plants, with their own account</span>
          </button>
          <button type="button" aria-pressed={role === "sitter"} onClick={() => setRole("sitter")} className={chip(role === "sitter")}>
            <span className="block font-medium">🧳 Plant-sitter</span>
            <span className="text-xs text-muted">Chosen plants and dates, no account needed</span>
          </button>
        </div>

        <label className="block">
          <span className="font-medium">Their name</span>
          <input
            required
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={role === "sitter" ? "e.g. Ana (neighbour)" : "e.g. Laura"}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-leaf"
          />
        </label>

        {role === "sitter" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="font-medium">From</span>
                <input type="date" required value={from} min={toInput(today)} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" />
              </label>
              <label>
                <span className="font-medium">Until</span>
                <input type="date" required value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" />
              </label>
            </div>
            <fieldset>
              <legend className="font-medium">Which plants?</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {plants.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={chosen.includes(p.id)}
                    onClick={() => setChosen((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))}
                    className={chip(chosen.includes(p.id))}
                  >
                    {p.nickname}
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {error && <p className="text-bad">{error}</p>}
        <button
          disabled={busy || !name.trim() || (role === "sitter" && !chosen.length)}
          className="w-full rounded-full bg-leaf py-2.5 font-medium text-background disabled:opacity-40"
        >
          {busy ? "Creating…" : "Create invite link"}
        </button>
        {link && (
          <LinkBox
            url={link.url}
            text={
              role === "sitter"
                ? `Hi ${link.name}! Here's the link for looking after my plants. It shows what needs water each day 🌿`
                : `Hi ${link.name}! Join me in looking after our plants on Love My Plants 🌿`
            }
          />
        )}
      </form>
    </section>
  );
}
