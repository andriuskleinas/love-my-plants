import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LOW_CONFIDENCE } from "@/lib/ai/schemas";
import { looksRecovered, planLength, rescueDay, sameLocalDay, stepsDueOn, type RescueStep } from "@/lib/care/rescue";
import { createClient } from "@/lib/supabase/server";
import { EndRescue, RescueSteps } from "./rescue-controls";
import { TriageFlow } from "./triage-flow";

export const metadata: Metadata = { title: "Plant ER · Love My Plants" };

type Diagnosis = { cause: string; explanation: string; confidence: number }[];
type Extra = { canBeSaved?: boolean; fallback?: string | null; checkinDays?: number[] };

const likelihood = (c: number) => (c >= 0.7 ? "Most likely" : c >= LOW_CONFIDENCE ? "Likely" : "Possible");

export default async function RescuePage({ params }: PageProps<"/plants/[id]/rescue">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: plant } = await supabase.from("plants").select("id, home_id, nickname, status").eq("id", id).maybeSingle();
  if (!plant) notFound();

  const { data: claims } = await supabase.auth.getClaims();
  const [{ data: rescue }, { data: latest }, { data: profile }] = await Promise.all([
    supabase
      .from("rescue_plans")
      .select("id, diagnosis, steps, progress, started_at, extra")
      .eq("plant_id", id)
      .is("ended_at", null)
      .maybeSingle(),
    supabase.from("assessments").select("health, created_at").eq("plant_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("profiles").select("timezone").eq("id", claims?.claims?.sub ?? "").maybeSingle(),
  ]);
  const tz = profile?.timezone ?? "UTC";

  const back = (
    <Link href={`/plants/${plant.id}`} className="text-sm text-muted">
      ← {plant.nickname}
    </Link>
  );

  if (!rescue) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-6">
        {back}
        <TriageFlow plantId={plant.id} homeId={plant.home_id} nickname={plant.nickname} />
      </main>
    );
  }

  const now = new Date();
  const steps = rescue.steps as RescueStep[];
  const progress = rescue.progress as Record<string, string>;
  const extra = rescue.extra as Extra;
  const day = rescueDay(new Date(rescue.started_at), now, tz);
  const length = planLength(steps);
  const today = stepsDueOn(steps, progress, day);
  const upcoming = steps.map((s, index) => ({ ...s, index })).filter((s) => s.day > day);
  const checkinToday = (extra.checkinDays ?? []).includes(day) || day > length;
  const lastCheck = latest ? new Date(latest.created_at) : null;
  const checkedToday = lastCheck != null && sameLocalDay(lastCheck, now, tz);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-6">
      {back}
      <h1 className="mt-3 text-2xl font-semibold">🚨 Rescuing {plant.nickname}</h1>
      <p className="mt-1 text-muted">
        Day {Math.min(day, length)} of {length}
        {latest && <> · health {latest.health}</>}
      </p>

      {latest && looksRecovered(latest.health) && (
        <div className="mt-4 rounded-2xl bg-leaf-soft p-4 text-sm">
          <p className="font-semibold">🎉 {plant.nickname} looks like it&apos;s recovering!</p>
          <p className="mt-1 text-muted">Its latest check scored {latest.health}. You can end the rescue below whenever you&apos;re ready.</p>
        </div>
      )}

      {extra.canBeSaved === false && (
        <div className="mt-4 rounded-2xl bg-warn/15 p-4 text-sm">
          <p className="font-semibold">This one may not make it</p>
          <p className="mt-1">It&apos;s worth trying the steps below, but please also do this so the plant lives on:</p>
          {extra.fallback && <p className="mt-2 font-medium">🌱 {extra.fallback}</p>}
        </div>
      )}
      {extra.canBeSaved !== false && extra.fallback && (
        <p className="mt-4 rounded-2xl border border-border bg-surface p-3 text-sm">
          <b>Plan B:</b> {extra.fallback}
        </p>
      )}

      {(checkinToday || day > length) && !checkedToday && (
        <Link
          href={`/plants/${plant.id}/checkin`}
          className="mt-4 flex items-center justify-between rounded-2xl border border-leaf bg-leaf-soft p-4 text-sm"
        >
          <span>
            📸 <b>Rescue check-in today</b>
            <span className="block text-muted">One photo shows how it&apos;s responding and updates the plan.</span>
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Today</h2>
        {today.length ? (
          <div className="mt-3">
            <RescueSteps plantId={plant.id} items={today.map((s) => ({ index: s.index, step: s.step, done: s.done, late: s.day < day }))} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Nothing to do today. Give it rest, light and patience. 🌿</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">What&apos;s wrong</h2>
        <ol className="mt-3 space-y-2">
          {(rescue.diagnosis as Diagnosis).map((d, i) => (
            <li key={i} className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{likelihood(d.confidence)}</p>
              <p className="font-semibold">{d.cause}</p>
              <p className="mt-1 text-sm text-muted">{d.explanation}</p>
            </li>
          ))}
        </ol>
      </section>

      {upcoming.length > 0 && (
        <details className="mt-8 rounded-2xl border border-border bg-surface text-sm">
          <summary className="cursor-pointer select-none p-4 font-semibold">Coming up ({upcoming.length} steps)</summary>
          <ol className="space-y-2 px-4 pb-4">
            {upcoming.map((s) => (
              <li key={s.index} className="flex gap-3">
                <span className="w-14 shrink-0 text-muted">Day {s.day}</span>
                <span>{s.step}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      <EndRescue plantId={plant.id} nickname={plant.nickname} />
    </main>
  );
}
