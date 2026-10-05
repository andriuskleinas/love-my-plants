"use client";

import { useToast } from "@/components/toast";
import { callApi } from "@/lib/api-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WaterOutcome } from "@/lib/care/watering";
import { dueLabel } from "@/lib/plants/format";

export interface WaterCardProps {
  taskId: string;
  plantId: string;
  nickname: string;
  title: string;
  detail: string | null;
  dueAt: string;
  photoUrl?: string | null;
  showPlantLink?: boolean;
  /** Plant-sitter page: post answers here instead of the signed-in endpoint. */
  answerEndpoint?: string;
}

const RESULT_TEXT: Record<WaterOutcome, string> = {
  dry: "Watered 💧",
  dry_drooping: "Watered 💧 We'll water a bit more often from now on.",
  damp: "Skipped. We'll check again in 2 days and space out future waterings a little.",
  snooze: "OK, we'll remind you tomorrow.",
};

/** What the Undo toast says while the answer waits to be saved. */
const UNDO_TEXT: Record<WaterOutcome, (name: string) => string> = {
  dry: (name) => `Watered ${name} 💧`,
  dry_drooping: (name) => `Watered ${name} 💧`,
  damp: (name) => `Skipped ${name}: soil still damp`,
  snooze: (name) => `${name}: reminder moved to tomorrow`,
};

/**
 * Sends a watering answer; Today and the plant page share it. In the signed-in app the answer
 * waits behind an Undo toast and the card hides meanwhile; elsewhere it's saved straight away.
 */
export function useWaterAnswer(taskId: string, nickname: string, answerEndpoint?: string) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  async function send(outcome: WaterOutcome, keepalive = false) {
    const res = await callApi<{ nextDueAt: string }>(answerEndpoint ?? `/api/tasks/${taskId}/answer`, {
      method: "POST",
      json: answerEndpoint ? { taskId, outcome } : { outcome },
      keepalive,
    });
    if (!res.ok) return res;
    const next = outcome === "dry" || outcome === "dry_drooping" ? ` Next time: ${dueLabel(new Date(res.data.nextDueAt))}.` : "";
    return { ok: true as const, message: RESULT_TEXT[outcome] + next };
  }

  async function answer(outcome: WaterOutcome) {
    setError(null);
    if (toast) {
      setHidden(true);
      toast.defer({
        message: UNDO_TEXT[outcome](nickname),
        run: async () => {
          const res = await send(outcome, true);
          if (res.ok) router.refresh();
          return res;
        },
        onUndo: () => setHidden(false),
        onError: (message) => {
          setHidden(false);
          setError(message);
        },
      });
      return;
    }
    setBusy(true);
    const res = await send(outcome);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res.message);
    setTimeout(() => router.refresh(), 2500);
  }

  return { answer, busy, result, error, hidden };
}

export function WaterCard({
  taskId,
  plantId,
  nickname,
  title,
  detail,
  dueAt,
  photoUrl,
  showPlantLink = true,
  answerEndpoint,
}: WaterCardProps) {
  const { answer, busy, result, error, hidden } = useWaterAnswer(taskId, nickname, answerEndpoint);
  if (hidden) return null;

  const due = dueLabel(new Date(dueAt));
  const overdue = due.endsWith("overdue");

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-leaf-soft text-xl">💧</div>
        )}
        <div className="min-w-0">
          <p className="font-semibold">
            {showPlantLink ? (
              <Link href={`/plants/${plantId}`} className="hover:underline">
                {nickname}
              </Link>
            ) : (
              nickname
            )}{" "}
            <span className={`text-sm font-normal ${overdue ? "text-terracotta" : "text-muted"}`}>· {due}</span>
          </p>
          <p className="text-sm">{title}</p>
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
          <div className="mt-2 flex flex-wrap justify-between gap-x-4 text-sm text-muted">
            <button disabled={busy} onClick={() => answer("dry_drooping")} className="py-1 underline-offset-2 hover:underline">
              Bone dry &amp; droopy, watered it
            </button>
            <button disabled={busy} onClick={() => answer("snooze")} className="py-1 underline-offset-2 hover:underline">
              Remind me tomorrow
            </button>
          </div>
          {detail && <p className="mt-2 text-xs text-muted">{detail}</p>}
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
