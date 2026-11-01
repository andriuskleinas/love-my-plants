"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { callApi } from "@/lib/api-client";
import { TIP_NOTE_MAX, TIP_QUIET_DAYS, type TipAnswerKind } from "@/lib/care/tips";
import { CompactList, RowText, RowToggle } from "./task-list";

export type TipItem = {
  key: string;
  plantId: string;
  nickname: string;
  photoUrl: string | null;
  assessmentId: string;
  index: number;
  title: string;
  step: string;
  why: string;
  /** Shown on the plant page, where answered tips stay listed with their note. */
  answered?: { answer: TipAnswerKind; note: string | null } | null;
};

const SHOWN = 3;
const ANSWER_LABELS: Record<TipAnswerKind, string> = { done: "Done", cant: "Can't do this", later: "Later" };
const NOTE_PLACEHOLDER: Record<"done" | "cant", string> = {
  done: "What you did",
  cant: "Why it isn't possible",
};

/**
 * The AI's tips: one-off changes like "Move closer to the window". Each is answered once
 * (done, can't, later) instead of ticked, so it doesn't come back with every check.
 * On Today an answered tip disappears; on the plant page (`onPlantPage`) it stays with its answer.
 */
export function TipList({ tips, onPlantPage = false }: { tips: TipItem[]; onPlantPage?: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? tips : tips.slice(0, SHOWN);
  return (
    <CompactList more={all ? 0 : tips.length - shown.length} onMore={() => setAll(true)}>
      {shown.map((t) => (
        <li key={t.key} className="empty:hidden">
          <TipRow tip={t} onPlantPage={onPlantPage} />
        </li>
      ))}
    </CompactList>
  );
}

function TipRow({ tip, onPlantPage }: { tip: TipItem; onPlantPage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<"done" | "cant" | null>(null);
  const [note, setNote] = useState("");
  const [answered, setAnswered] = useState(tip.answered ?? null);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  const save = (answer: TipAnswerKind, text: string, keepalive = false) =>
    callApi(`/api/plants/${tip.plantId}/tips`, {
      method: "POST",
      json: { assessmentId: tip.assessmentId, index: tip.index, answer, note: text.trim() || undefined },
      keepalive,
    });

  async function submit(answer: TipAnswerKind) {
    setError(null);
    const previous = answered;
    const text = answer === "later" ? "" : note;
    setAnswered({ answer, note: text.trim() || null });
    setOpen(false);
    setNoteFor(null);
    const message =
      answer === "later" ? `Later: ${tip.title}` : `${ANSWER_LABELS[answer]}: ${tip.title}. Quiet for ${TIP_QUIET_DAYS / 7} weeks.`;
    const rollBack = (msg?: string) => {
      setAnswered(previous);
      if (msg) setError(msg);
    };
    if (toast) {
      cancel.current = toast.defer({
        message,
        run: async () => {
          cancel.current = null;
          const res = await save(answer, text, true);
          if (!res.ok) return res;
          router.refresh();
          return { ok: true };
        },
        onUndo: () => {
          cancel.current = null;
          rollBack();
        },
        onError: (msg) => rollBack(msg),
      });
      return;
    }
    const res = await save(answer, text);
    if (!res.ok) return rollBack(res.error);
    router.refresh();
  }

  if (answered && !onPlantPage) return error ? <p role="alert" className="p-3 text-sm text-bad">{error}</p> : null;

  const sub = answered
    ? `${ANSWER_LABELS[answered.answer]}${answered.note ? ` · “${answered.note}”` : ""}`
    : onPlantPage
      ? "Tip"
      : `💡 ${tip.nickname}`;

  return (
    <div>
      <div className="flex pr-3">
        <RowToggle open={open} onToggle={() => setOpen(!open)}>
          <RowText url={onPlantPage ? undefined : tip.photoUrl} title={tip.title} sub={sub} titleClass={answered ? "text-muted" : ""} />
        </RowToggle>
      </div>
      {open && (
        <div className={`px-3 pb-3 text-sm ${onPlantPage ? "" : "pl-16"}`}>
          <p>{tip.step}</p>
          {tip.why && <p className="mt-1 text-muted">Why: {tip.why}</p>}
          {noteFor ? (
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                submit(noteFor);
              }}
            >
              <label htmlFor={`note-${tip.key}`} className="block text-muted">
                Add a note (optional)
              </label>
              <textarea
                id={`note-${tip.key}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={TIP_NOTE_MAX}
                rows={2}
                autoFocus
                placeholder={NOTE_PLACEHOLDER[noteFor]}
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-base"
              />
              <p className="mt-1 text-xs text-muted">The next health check reads your note.</p>
              <div className="mt-2 flex gap-2">
                <button type="submit" className="rounded-full bg-leaf px-4 py-2 font-medium text-background">
                  Save
                </button>
                <button type="button" onClick={() => setNoteFor(null)} className="rounded-full border border-border px-4 py-2 font-medium">
                  Back
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setNoteFor("done")} className="rounded-full bg-leaf px-4 py-2 font-medium text-background">
                Done ✓
              </button>
              <button onClick={() => setNoteFor("cant")} className="rounded-full border border-border px-4 py-2 font-medium">
                Can&apos;t do this
              </button>
              <button onClick={() => submit("later")} className="rounded-full px-3 py-2 font-medium text-muted">
                Later
              </button>
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="px-3 pb-3 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
