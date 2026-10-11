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

export type LogPlant = { id: string; nickname: string; potCm: number; photoUrl?: string | null };

type Props = {
  open: boolean;
  /** Start on this kind of care instead of the list. */
  initialType: LogType | null;
  onClose: () => void;
  /** One plant (its own page) or several to choose from (Today). */
  plants: LogPlant[];
};

type Saved = { nickname: string; nextDueAt?: string | null; learned?: boolean };

/** "Sir Hiss", "Sir Hiss and Palmela", "Sir Hiss, Palmela and Lucky Penny" */
const names = (list: string[]) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);

/** What the toast says once everything is saved. */
function savedMessage(type: LogType, saved: Saved[], pot: number): string {
  if (type === "repot") return `Saved. ${saved[0].nickname}'s plan now follows the ${pot} cm pot.`;
  const next = saved.filter((s) => s.nextDueAt);
  if (type !== "water" || !next.length) return "Saved to the care history.";
  const when =
    next.length === 1
      ? `Next watering ${dueLabel(new Date(next[0].nextDueAt!))}.`
      : `Next watering: ${next.map((s) => `${s.nickname} ${dueLabel(new Date(s.nextDueAt!))}`).join(", ")}.`;
  const faster = saved.filter((s) => s.learned).map((s) => s.nickname);
  if (!faster.length) return when;
  return `${when} ${names(faster)} ${faster.length > 1 ? "dry" : "dries"} out faster than we thought, so we'll water a bit more often.`;
}

/** "I did something": log care done without a reminder, so the plan can follow. */
export function LogCareSheet({ open, initialType, onClose, plants }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const toast = useToast();
  const single = plants.length === 1;
  const [chosen, setChosen] = useState<string[]>([]);
  const [pickingPlants, setPickingPlants] = useState(!single);
  const [type, setType] = useState<LogType | null>(null);
  const [day, setDay] = useState<Day>("today");
  const [earlier, setEarlier] = useState("");
  const [soil, setSoil] = useState<LoggedSoil | null>(null);
  const [note, setNote] = useState("");
  const [pot, setPot] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setChosen(single ? [plants[0].id] : []);
      setPickingPlants(!single);
      setType(initialType);
      setDay("today");
      setEarlier("");
      setSoil(null);
      setNote("");
      setError(null);
      dialog.showModal();
      dialog.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open, initialType, single, plants]);

  const selected = plants.filter((p) => chosen.includes(p.id));
  const who = selected.length === 1 ? selected[0].nickname : `${selected.length} plants`;
  const potCm = selected.length === 1 ? selected[0].potCm : 0;
  // Repotting needs one plant's pot size, so it's offered for one plant at a time.
  const types = selected.length > 1 ? LOG_TYPES.filter((t) => t !== "repot") : LOG_TYPES;

  const today = new Date();
  const minDate = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30));
  const maxDate = isoDate(today);
  const potSizes = [...new Set([potCm, ...STANDARD_POT_SIZES_CM.filter((s) => s >= potCm - 5 && s <= potCm + 15)])].sort((a, b) => a - b);

  const missing =
    (day === "earlier" && !earlier) || (type === "water" && !soil) || (type === "other" && !note.trim());

  function chooseType(t: LogType) {
    setType(t);
    if (t === "repot") setPot(nextPotSize(potCm));
  }

  function back() {
    if (type) setType(null);
    else setPickingPlants(true);
  }

  async function send(keepalive: boolean) {
    if (!type) return { ok: false as const, error: "Nothing was chosen. Choose what you did." };
    const doneAt = doneAtFor(day, earlier);
    const saved: Saved[] = [];
    // One at a time, so each plant's schedule is planned from a settled state.
    for (const plant of selected) {
      if (type === "repot") {
        const res = await callApi(`/api/plants/${plant.id}/repotted`, { method: "POST", json: { potDiameterCm: pot, doneAt }, keepalive });
        if (!res.ok) return res;
        saved.push({ nickname: plant.nickname });
        continue;
      }
      const res = await callApi<{ nextDueAt?: string | null; learned?: boolean }>(`/api/plants/${plant.id}/care`, {
        method: "POST",
        json: { type, doneAt, soil: type === "water" ? soil : undefined, note: note.trim() || undefined },
        keepalive,
      });
      if (!res.ok) {
        const done = saved.map((s) => s.nickname);
        return { ok: false as const, error: done.length ? `${res.error} ${names(done)} ${done.length > 1 ? "were" : "was"} saved.` : res.error };
      }
      saved.push({ nickname: plant.nickname, ...res.data });
    }
    return { ok: true as const, message: savedMessage(type, saved, pot) };
  }

  async function save() {
    if (!type || missing || !selected.length) return;
    const { emoji, label } = CARE_LABELS[type];
    setError(null);
    if (toast) {
      onClose();
      toast.defer({
        message: `${emoji} ${type === "other" ? "Logged" : label} · ${names(selected.map((p) => p.nickname))}`,
        run: async () => {
          const res = await send(true);
          router.refresh();
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
    router.refresh();
    if (!res.ok) return setError(res.error);
    onClose();
  }

  const chip = (selected: boolean) =>
    `rounded-xl border px-3 py-2 text-sm ${selected ? "border-leaf bg-leaf-soft font-medium" : "border-border"}`;

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-label={single ? `Log care for ${plants[0].nickname}` : "Log care"}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-surface p-0 text-foreground outline-none backdrop:bg-black/40 lg:m-auto lg:max-w-md lg:rounded-3xl"
    >
      <div className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border lg:hidden" aria-hidden />
        <div className="flex items-center gap-2">
          {!pickingPlants && (type || !single) && (
            <button onClick={back} aria-label="Back" className="-ml-2 rounded-full p-2 text-muted">
              <BackIcon size={20} />
            </button>
          )}
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">
            {pickingPlants
              ? "Which plants?"
              : type
                ? `${CARE_LABELS[type].emoji} ${CARE_LABELS[type].label}${single ? "" : ` · ${who}`}`
                : `What did you do for ${who}?`}
          </h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 rounded-full p-2 text-muted">
            <CloseIcon size={20} />
          </button>
        </div>

        {pickingPlants ? (
          <>
            <p className="mt-1 text-sm text-muted">Log care you did without a reminder, so the plan can follow. Choose one or more.</p>
            <ul className="mt-4 grid grid-cols-3 gap-2">
              {plants.map((p) => {
                const on = chosen.includes(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setChosen((c) => (on ? c.filter((id) => id !== p.id) : [...c, p.id]))}
                      className={`relative flex w-full flex-col items-center gap-1.5 rounded-2xl border p-2 text-center text-sm ${on ? "border-leaf bg-leaf-soft font-medium" : "border-border"}`}
                    >
                      {p.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                        <img src={p.photoUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
                      ) : (
                        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-leaf-soft text-2xl" aria-hidden>
                          🪴
                        </span>
                      )}
                      <span className="w-full truncate">{p.nickname}</span>
                      {on && (
                        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-leaf text-xs text-background" aria-hidden>
                          ✓
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setChosen(chosen.length === plants.length ? [] : plants.map((p) => p.id))}
                className="h-12 rounded-full border border-border px-4 text-sm font-medium"
              >
                {chosen.length === plants.length ? "Clear" : "All plants"}
              </button>
              <button
                type="button"
                disabled={!chosen.length}
                onClick={() => {
                  setPickingPlants(false);
                  if (type === "repot" && chosen.length > 1) setType(null);
                }}
                className="h-12 flex-1 rounded-full bg-leaf font-medium text-background disabled:opacity-50"
              >
                Next{chosen.length ? ` (${chosen.length})` : ""}
              </button>
            </div>
          </>
        ) : !type ? (
          <>
            <p className="mt-1 text-sm text-muted">Log care you did without a reminder, so the plan can follow.</p>
            <ul className="mt-4 grid grid-cols-3 gap-2">
              {types.map((t) => (
                <li key={t}>
                  <button
                    onClick={() => chooseType(t)}
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
                  <p className="mt-2 text-xs text-muted">If it dried out before the reminder, we&apos;ll water {selected.length === 1 ? selected[0].nickname : "them"} a bit more often.</p>
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
