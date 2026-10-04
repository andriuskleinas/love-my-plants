"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronIcon } from "@/components/icons";
import { useWaterAnswer } from "@/components/water-card";
import { callApi } from "@/lib/api-client";
import type { TodayTask } from "@/lib/care/today";
import { dueLabel } from "@/lib/plants/format";

const LABELS: Record<TodayTask["kind"], { text: string; className: string }> = {
  rescue: { text: "🚨 Rescue", className: "bg-terracotta/15 text-terracotta" },
  water: { text: "💧 Water", className: "bg-leaf-soft text-leaf" },
  checkin: { text: "📸 Check-in", className: "bg-warn/15 text-warn" },
  step: { text: "✓ Care steps", className: "bg-border/60 text-muted" },
};

type StepTask = Extract<TodayTask, { kind: "step" }>;
type Item = { key: string; task: Exclude<TodayTask, StepTask> } | { key: string; steps: StepTask[] };

/** One card per plant for its care steps, so the plant isn't repeated on every line. */
function groupSteps(tasks: TodayTask[]): Item[] {
  const items: Item[] = [];
  for (const t of tasks) {
    if (t.kind !== "step") {
      items.push({ key: t.key, task: t });
      continue;
    }
    const group = items.find((i): i is { key: string; steps: StepTask[] } => "steps" in i && i.steps[0].plantId === t.plantId);
    if (group) group.steps.push(t);
    else items.push({ key: `g${t.plantId}`, steps: [t] });
  }
  return items;
}

/** Today's to-do list, most urgent first: rescues, watering and check-ins, then each plant's care steps. */
export function TaskList({ tasks }: { tasks: TodayTask[] }) {
  return (
    <ul className="space-y-2">
      {groupSteps(tasks).map((item) => (
        <li key={item.key}>
          {"steps" in item ? (
            <StepGroup steps={item.steps} />
          ) : item.task.kind === "water" ? (
            <WaterRow task={item.task} />
          ) : (
            <LinkRow task={item.task} />
          )}
        </li>
      ))}
    </ul>
  );
}

function Thumb({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
    <img src={url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
  ) : (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-leaf-soft text-xl" aria-hidden>
      🪴
    </div>
  );
}

function Meta({ task, extra }: { task: TodayTask; extra?: ReactNode }) {
  const label = LABELS[task.kind];
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className={`rounded-full px-2 py-0.5 font-medium ${label.className}`}>{label.text}</span>
      <span className="text-muted">{task.nickname}</span>
      {extra}
    </p>
  );
}

function LinkRow({ task }: { task: Extract<TodayTask, { kind: "rescue" | "checkin" }> }) {
  const href = task.kind === "rescue" ? `/plants/${task.plantId}/rescue` : `/plants/${task.plantId}/checkin`;
  const title = task.kind === "rescue" ? task.text : "Take this week's photo";
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-2xl border bg-surface p-3 ${task.kind === "rescue" ? "border-terracotta" : "border-border"}`}
    >
      <Thumb url={task.photoUrl} />
      <div className="min-w-0 flex-1">
        <Meta task={task} />
        <p className="mt-1 font-medium">{title}</p>
      </div>
      <ChevronIcon size={18} className="shrink-0 text-muted" />
    </Link>
  );
}

function WaterRow({ task }: { task: Extract<TodayTask, { kind: "water" }> }) {
  const { answer, busy, result, error } = useWaterAnswer(task.taskId);
  const [more, setMore] = useState(false);
  const due = dueLabel(new Date(task.dueAt));

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center gap-3">
        <Thumb url={task.photoUrl} />
        <div className="min-w-0 flex-1">
          <Meta task={task} extra={task.overdue && <span className="text-terracotta">{due}</span>} />
          <p className="mt-1 font-medium">{task.title}</p>
        </div>
      </div>

      {result ? (
        <p role="status" className="mt-3 rounded-xl bg-leaf-soft p-3 text-sm">
          {result}
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted">First push a finger 2–3 cm into the soil. Is it dry?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              disabled={busy}
              onClick={() => answer("dry")}
              className="rounded-full bg-leaf px-3 py-2.5 text-sm font-medium text-background disabled:opacity-50"
            >
              Dry, I watered it
            </button>
            <button
              disabled={busy}
              onClick={() => answer("damp")}
              className="rounded-full border border-border px-3 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              Still damp
            </button>
          </div>
          {more ? (
            <div className="mt-2 flex flex-wrap justify-between gap-x-4 text-sm text-muted">
              <button disabled={busy} onClick={() => answer("dry_drooping")} className="py-1 underline-offset-2 hover:underline">
                Bone dry &amp; droopy, watered it
              </button>
              <button disabled={busy} onClick={() => answer("snooze")} className="py-1 underline-offset-2 hover:underline">
                Remind me tomorrow
              </button>
            </div>
          ) : (
            <button onClick={() => setMore(true)} className="mt-2 py-1 text-sm text-muted underline-offset-2 hover:underline">
              Other answers…
            </button>
          )}
          {task.detail && <p className="mt-1 text-xs text-muted">{task.detail}</p>}
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

function StepGroup({ steps }: { steps: StepTask[] }) {
  const first = steps[0];
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center gap-3">
        <Thumb url={first.photoUrl} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-medium ${LABELS.step.className}`}>{LABELS.step.text}</span>
            <span className="text-muted">
              {steps.length} from the last health check
            </span>
          </p>
          <Link href={`/plants/${first.plantId}`} className="mt-1 block font-medium hover:underline">
            {first.nickname}
          </Link>
        </div>
      </div>
      <ul className="mt-2 divide-y divide-border">
        {steps.map((t) => (
          <StepLine key={t.key} task={t} />
        ))}
      </ul>
    </div>
  );
}

function StepLine({ task }: { task: StepTask }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !done;
    setDone(next);
    setError(null);
    const res = await callApi(`/api/plants/${task.plantId}/steps`, {
      method: "POST",
      json: { assessmentId: task.assessmentId, index: task.index, done: next },
    });
    if (!res.ok) {
      setDone(!next); // roll back
      setError(res.error);
      return;
    }
    // Let the tick show for a moment, then move it into today's progress.
    if (next) setTimeout(() => router.refresh(), 1200);
  }

  return (
    <li className="py-2.5 first:pt-3 last:pb-0.5">
      <div className="flex gap-3">
        <button
          onClick={toggle}
          role="checkbox"
          aria-checked={done}
          aria-label={`Done: ${task.step}`}
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            done ? "border-leaf bg-leaf text-background" : "border-border text-transparent hover:border-leaf"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className={done ? "text-muted line-through" : ""}>{task.step}</p>
          {task.why && !done && (
            <details className="mt-0.5 text-sm text-muted">
              <summary className="cursor-pointer select-none">Why?</summary>
              <p className="mt-1">{task.why}</p>
            </details>
          )}
          {error && (
            <p role="alert" className="mt-1 text-sm text-bad">
              {error}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
