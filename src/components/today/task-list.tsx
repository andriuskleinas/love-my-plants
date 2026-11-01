"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { ChevronIcon } from "@/components/icons";
import { PlantPicture } from "@/components/plant-picture";
import { useToast } from "@/components/toast";
import { useWaterAnswer } from "@/components/water-card";
import { callApi } from "@/lib/api-client";
import type { TodayTask } from "@/lib/care/today";
import { dueLabel } from "@/lib/plants/format";

/** Rows shown before "Show N more". */
const SHOWN = 5;

type StepTask = Extract<TodayTask, { kind: "step" }>;

/** Today's to-do list, most urgent first: one line per task, tap to open the details. */
export function TaskList({ tasks }: { tasks: TodayTask[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? tasks : tasks.slice(0, SHOWN);
  return (
    <CompactList more={all ? 0 : tasks.length - shown.length} onMore={() => setAll(true)}>
      {shown.map((t) => (
        <li key={t.key} className="empty:hidden">
          {t.kind === "water" ? <WaterRow task={t} /> : t.kind === "step" ? <StepRow task={t} /> : <LinkRow task={t} />}
        </li>
      ))}
    </CompactList>
  );
}

/** A bordered list of one-line rows with an optional "Show N more" at the bottom. */
export function CompactList({ children, more, onMore }: { children: ReactNode; more: number; onMore: () => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <ul className="divide-y divide-border">{children}</ul>
      {more > 0 && (
        <button onClick={onMore} className="w-full border-t border-border py-2.5 text-sm font-medium text-leaf">
          Show {more} more
        </button>
      )}
    </div>
  );
}

export function Thumb({ url }: { url: string | null }) {
  return url ? (
    <PlantPicture url={url} className="h-10 w-10 shrink-0 rounded-lg" />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-leaf-soft text-lg" aria-hidden>
      🪴
    </span>
  );
}

/** Picture, title and a muted second line, all on one row. */
export function RowText({ url, title, sub, titleClass = "" }: { url?: string | null; title: string; sub: ReactNode; titleClass?: string }) {
  return (
    <>
      {url !== undefined && <Thumb url={url} />}
      <span className="min-w-0 flex-1">
        <span className={`line-clamp-2 font-medium leading-snug ${titleClass}`}>{title}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
    </>
  );
}

/** The tappable top line of a row that opens its details. */
export function RowToggle({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left">
      {children}
      <ChevronIcon size={16} className={`shrink-0 text-muted transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
    </button>
  );
}

function LinkRow({ task }: { task: Extract<TodayTask, { kind: "rescue" | "checkin" }> }) {
  const rescue = task.kind === "rescue";
  return (
    <Link
      href={rescue ? `/plants/${task.plantId}/rescue` : `/plants/${task.plantId}/checkin`}
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-background"
    >
      <RowText
        url={task.photoUrl}
        title={rescue ? task.text : "Take this week's photo"}
        sub={`${rescue ? "🚨" : "📸"} ${task.nickname}`}
        titleClass={rescue ? "text-terracotta" : ""}
      />
      <ChevronIcon size={16} className="shrink-0 text-muted" />
    </Link>
  );
}

function WaterRow({ task }: { task: Extract<TodayTask, { kind: "water" }> }) {
  const { answer, busy, result, error, hidden } = useWaterAnswer(task.taskId, task.nickname);
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  if (hidden) return null;
  const due = task.overdue ? <span className="text-terracotta">{dueLabel(new Date(task.dueAt))}</span> : "today";

  return (
    <div>
      <div className="flex pr-3">
        <RowToggle open={open || !!result} onToggle={() => setOpen(!open)}>
          <RowText url={task.photoUrl} title={task.title} sub={<>💧 {task.nickname} · {due}</>} />
        </RowToggle>
      </div>
      {result ? (
        <p role="status" className="mx-3 mb-3 rounded-xl bg-leaf-soft p-3 text-sm">
          {result}
        </p>
      ) : (
        open && (
          <div className="px-3 pb-3 pl-16">
            <p className="text-sm text-muted">First push a finger 2–3 cm into the soil. Is it dry?</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                disabled={busy}
                onClick={() => answer("dry")}
                className="rounded-full bg-leaf px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                Dry, I watered it
              </button>
              <button
                disabled={busy}
                onClick={() => answer("damp")}
                className="rounded-full border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                Still damp
              </button>
            </div>
            {more ? (
              <div className="mt-1 flex flex-wrap justify-between gap-x-4 text-sm text-muted">
                <button disabled={busy} onClick={() => answer("dry_drooping")} className="py-1 underline-offset-2 hover:underline">
                  Bone dry &amp; droopy, watered it
                </button>
                <button disabled={busy} onClick={() => answer("snooze")} className="py-1 underline-offset-2 hover:underline">
                  Remind me tomorrow
                </button>
              </div>
            ) : (
              <button onClick={() => setMore(true)} className="mt-1 py-1 text-sm text-muted underline-offset-2 hover:underline">
                Other answers…
              </button>
            )}
            {task.detail && <p className="mt-1 text-xs text-muted">{task.detail}</p>}
          </div>
        )
      )}
      {error && (
        <p role="alert" className="px-3 pb-3 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

function StepRow({ task }: { task: StepTask }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  const save = (next: boolean, keepalive = false) =>
    callApi(`/api/plants/${task.plantId}/steps`, {
      method: "POST",
      json: { assessmentId: task.assessmentId, index: task.index, done: next },
      keepalive,
    });

  async function toggle() {
    setError(null);
    // Tapping again before the tick is saved is the same as Undo.
    if (cancel.current) {
      cancel.current();
      return;
    }
    const next = !done;
    setDone(next);
    if (toast && next) {
      cancel.current = toast.defer({
        message: `Done: ${task.title}`,
        run: async () => {
          cancel.current = null;
          const res = await save(true, true);
          if (!res.ok) return res;
          // The tick moves into today's progress.
          router.refresh();
          return { ok: true };
        },
        onUndo: () => {
          cancel.current = null;
          setDone(false);
        },
        onError: (message) => {
          setDone(false);
          setError(message);
        },
      });
      return;
    }
    const res = await save(next);
    if (!res.ok) {
      setDone(!next); // roll back
      setError(res.error);
      return;
    }
    // Let the tick show for a moment, then move it into today's progress.
    if (next) setTimeout(() => router.refresh(), 1200);
  }

  return (
    <div>
      <div className="flex items-center">
        <RowToggle open={open} onToggle={() => setOpen(!open)}>
          <RowText url={task.photoUrl} title={task.title} sub={`✓ ${task.nickname}`} titleClass={done ? "text-muted line-through" : ""} />
        </RowToggle>
        <button
          onClick={toggle}
          role="checkbox"
          aria-checked={done}
          aria-label={`Done: ${task.title}`}
          className="flex h-12 w-12 shrink-0 items-center justify-center"
        >
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
              done ? "border-leaf bg-leaf text-background" : "border-border text-transparent hover:border-leaf"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 pl-16 text-sm">
          <p>{task.step}</p>
          {task.why && <p className="mt-1 text-muted">Why: {task.why}</p>}
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
