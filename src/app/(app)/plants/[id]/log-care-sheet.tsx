"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BackIcon, CloseIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { callApi } from "@/lib/api-client";
import { CARE_LABELS, LOG_TYPES, NOTE_MAX, type LogType } from "@/lib/care/log";
import { nextPotSize, STANDARD_POT_SIZES_CM } from "@/lib/care/repot";
import type { LoggedSoil } from "@/lib/care/watering";
import { dueLabel } from "@/lib/plants/format";

const OPEN_EVENT = "lmp:log-care";

/** Opens the plant page's "Log care" sheet from anywhere on the page, optionally on one kind of care. */
export function openLogCare(type?: LogType) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: type }));
}

/** Listens for openLogCare(); the sheet's owner decides how to show it. */
export function useLogCareRequests(onOpen: (type: LogType | null) => void) {
  const latest = useRef(onOpen);
  useEffect(() => {
    latest.current = onOpen;
  });
  useEffect(() => {
    const listener = (e: Event) => latest.current((e as CustomEvent<LogType | undefined>).detail ?? null);
    window.addEventListener(OPEN_EVENT, listener);
    return () => window.removeEventListener(OPEN_EVENT, listener);
  }, []);
}

/** A text link that opens the sheet, for use inside server-rendered parts of the page. */
export function LogCareLink({ type, children }: { type?: LogType; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => openLogCare(type)} className="font-medium text-leaf underline-offset-2 hover:underline">
      {children}
    </button>
  );
}

type Day = "today" | "yesterday" | "earlier";

const SOIL_CHOICES: { value: LoggedSoil; label: string }[] = [
  { value: "dry", label: "Dry" },
  { value: "dry_drooping", label: "Bone dry & droopy" },
  { value: "unknown", label: "Didn't check" },
];

const NOTE_HINTS: Partial<Record<LogType, string>> = {
  water: "e.g. watered from below",
  fertilize: "e.g. half-strength liquid feed",
  prune: "e.g. cut off 2 yellow leaves",
  mist: "e.g. misted the leaves",
  rotate: "e.g. turned it a quarter",
  clean: "e.g. wiped the dust off",
  pests: "e.g. neem oil spray",
  other: "What did you do?",
};

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The moment to record: now for today, midday for an earlier day. */
function doneAtFor(day: Day, earlier: string): string {
  if (day === "today") return new Date().toISOString();
  const now = new Date();
  const date = day === "yesterday" ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12) : new Date(`${earlier}T12:00`);
  return date.toISOString();
}

type Props = {
  open: boolean;
  /** Start on this kind of care instead of the list. */
  initialType: LogType | null;
  onClose: () => void;
  plantId: string;
  nickname: string;
  potCm: number;
};

/** "I did something": log care done without a reminder, so the plan can follow. */
export function LogCareSheet({ open, initialType, onClose, plantId, nickname, potCm }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<LogType | null>(null);
  const [day, setDay] = useState<Day>("today");
  const [earlier, setEarlier] = useState("");
  const [soil, setSoil] = useState<LoggedSoil | null>(null);
  const [note, setNote] = useState("");
  const [pot, setPot] = useState(nextPotSize(potCm));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setType(initialType);
      setDay("today");
      setEarlier("");
      setSoil(null);
      setNote("");
      setPot(nextPotSize(potCm));
      setError(null);
      dialog.showModal();
      dialog.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open, initialType, potCm]);

  const today = new Date();
  const minDate = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30));
  const maxDate = isoDate(today);
  const potSizes = [...new Set([potCm, ...STANDARD_POT_SIZES_CM.filter((s) => s >= potCm - 5 && s <= potCm + 15)])].sort((a, b) => a - b);

  const missing =
    (day === "earlier" && !earlier) || (type === "water" && !soil) || (type === "other" && !note.trim());

  async function send(keepalive: boolean) {
    const doneAt = doneAtFor(day, earlier);
    if (type === "repot") {
      const res = await callApi(`/api/plants/${plantId}/repotted`, { method: "POST", json: { potDiameterCm: pot, doneAt }, keepalive });
      return res.ok ? { ok: true as const, message: `Saved. ${nickname}'s plan now follows the ${pot} cm pot.` } : res;
    }
    const res = await callApi<{ nextDueAt?: string | null; learned?: boolean }>(`/api/plants/${plantId}/care`, {
      method: "POST",
      json: { type, doneAt, soil: type === "water" ? soil : undefined, note: note.trim() || undefined },
      keepalive,
    });
    if (!res.ok) return res;
    if (type !== "water" || !res.data.nextDueAt) return { ok: true as const, message: "Saved to the care history." };
    const next = `Next watering ${dueLabel(new Date(res.data.nextDueAt))}.`;
    return {
      ok: true as const,
      message: res.data.learned ? `${next} ${nickname} dries out faster than we thought, so we'll water a bit more often.` : next,
    };
  }

  async function save() {
    if (!type || missing) return;
    const { emoji, label } = CARE_LABELS[type];
    setError(null);
    if (toast) {
      onClose();
      toast.defer({
        message: `${emoji} ${type === "other" ? "Logged" : label} · ${nickname}`,
        run: async () => {
          const res = await send(true);
          if (res.ok) router.refresh();
          return res;
        },
        onUndo: () => {},
        onError: () => {},
      });
      return;
    }
    setBusy(true);
    const res = await send(false);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onClose();
    router.refresh();
  }

  const chip = (selected: boolean) =>
    `rounded-xl border px-3 py-2 text-sm ${selected ? "border-leaf bg-leaf-soft font-medium" : "border-border"}`;

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-label={`Log care for ${nickname}`}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-surface p-0 text-foreground outline-none backdrop:bg-black/40 lg:m-auto lg:max-w-md lg:rounded-3xl"
    >
      <div className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border lg:hidden" aria-hidden />
        <div className="flex items-center gap-2">
          {type && (
            <button onClick={() => setType(null)} aria-label="Back to the list" className="-ml-2 rounded-full p-2 text-muted">
              <BackIcon size={20} />
            </button>
          )}
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">
            {type ? `${CARE_LABELS[type].emoji} ${CARE_LABELS[type].label}` : `What did you do for ${nickname}?`}
          </h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 rounded-full p-2 text-muted">
            <CloseIcon size={20} />
          </button>
        </div>

        {!type ? (
          <>
            <p className="mt-1 text-sm text-muted">Log care you did without a reminder, so the plan can follow.</p>
            <ul className="mt-4 grid grid-cols-3 gap-2">
              {LOG_TYPES.map((t) => (
                <li key={t}>
                  <button
                    onClick={() => setType(t)}
                    className="flex h-full w-full flex-col items-center gap-1 rounded-2xl border border-border p-3 text-center text-sm"
                  >
                    <span className="text-2xl" aria-hidden>
                      {CARE_LABELS[t].emoji}
                    </span>
                    {CARE_LABELS[t].label}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-3 space-y-5">
            <fieldset>
              <legend className="text-sm text-muted">When?</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["today", "yesterday", "earlier"] as const).map((d) => (
                  <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={day === d} className={chip(day === d)}>
                    {d === "today" ? "Today" : d === "yesterday" ? "Yesterday" : "Earlier"}
                  </button>
                ))}
              </div>
              {day === "earlier" && (
                <input
                  type="date"
                  aria-label="Day you did it"
                  value={earlier}
                  min={minDate}
                  max={maxDate}
                  onChange={(e) => setEarlier(e.target.value)}
                  className="mt-2 h-11 rounded-xl border border-border bg-background px-3"
                />
              )}
            </fieldset>

            {type === "water" && (
              <fieldset>
                <legend className="text-sm text-muted">How was the soil before you watered?</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SOIL_CHOICES.map((c) => (
                    <button key={c.value} type="button" onClick={() => setSoil(c.value)} aria-pressed={soil === c.value} className={chip(soil === c.value)}>
                      {c.label}
                    </button>
                  ))}
                </div>
                {soil && soil !== "unknown" && (
                  <p className="mt-2 text-xs text-muted">If it dried out before the reminder, we&apos;ll water {nickname} a bit more often.</p>
                )}
              </fieldset>
            )}

            {type === "repot" && (
              <fieldset>
                <legend className="text-sm text-muted">How wide is the pot now?</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {potSizes.map((s) => (
                    <button key={s} type="button" onClick={() => setPot(s)} aria-pressed={pot === s} className={chip(pot === s)}>
                      {s} cm{s === potCm ? " (same)" : ""}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {type !== "repot" && (
              <label className="block">
                <span className="text-sm text-muted">{type === "other" ? "What did you do?" : "Note (optional)"}</span>
                <input
                  type="text"
                  value={note}
                  maxLength={NOTE_MAX}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={NOTE_HINTS[type]}
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"
                />
              </label>
            )}

            <button
              onClick={save}
              disabled={busy || missing}
              className="h-12 w-full rounded-full bg-leaf font-medium text-background disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
