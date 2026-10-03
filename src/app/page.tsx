import Link from "next/link";
import { InstallCoach } from "@/components/install-coach";
import { TelegramCard } from "@/components/telegram-card";
import { HealthBadge } from "@/components/report-card";
import { StepList, type StepItem } from "@/components/step-list";
import { WaterCard, type WaterCardProps } from "@/components/water-card";
import { assessmentSchema } from "@/lib/ai/schemas";
import { needsCheckin } from "@/lib/care/plan";
import { rescueDay, stepsDueOn, type RescueStep } from "@/lib/care/rescue";
import { endOfLocalDay } from "@/lib/care/schedule";
import { loadTrip, type TripView } from "@/lib/care/vacation.server";
import { dueLabel } from "@/lib/plants/format";
import { PHOTO_BUCKET } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

const isConfigured = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Steps from checks older than this no longer show on Today. */
const STEP_MAX_AGE_DAYS = 14;

type PlantRow = {
  id: string;
  nickname: string;
  species_name: string | null;
  status: string;
  photoUrl: string | null;
  health: number | null;
  waterDue: string | null;
};

type StepGroup = { plantId: string; nickname: string; assessmentId: string; items: StepItem[] };

export default async function Home() {
  if (!isConfigured()) return <Landing />;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return <Landing />;

  const [{ data: plants }, { data: profile }] = await Promise.all([
    supabase
      .from("plants")
      .select("id, nickname, species_name, status, cover:photos!plants_cover_photo_fk(storage_path)")
      .neq("status", "archived")
      .order("created_at"),
    supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle(),
  ]);
  if (!plants?.length) return <Today plants={[]} water={[]} steps={[]} checkins={[]} rescues={[]} trip={null} />;
  const trip = await loadTrip(supabase, userId);

  const ids = plants.map((p) => p.id);
  const coverPath = (p: (typeof plants)[number]) =>
    (Array.isArray(p.cover) ? p.cover[0] : p.cover)?.storage_path as string | undefined;
  const paths = plants.map(coverPath).filter((x): x is string => !!x);

  const [{ data: assessments }, { data: tasks }, { data: signed }, { data: photos }, { data: rescuePlans }] = await Promise.all([
    supabase
      .from("assessments")
      .select("id, plant_id, health, raw, created_at")
      .in("plant_id", ids)
      .order("created_at", { ascending: false }),
    supabase
      .from("care_tasks")
      .select("id, plant_id, title, detail, due_at")
      .in("plant_id", ids)
      .eq("type", "water")
      .in("status", ["pending", "snoozed"])
      .order("due_at"),
    paths.length
      ? supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
    supabase.from("photos").select("plant_id, taken_at").in("plant_id", ids).order("taken_at", { ascending: false }),
    supabase.from("rescue_plans").select("plant_id, started_at, steps, progress").in("plant_id", ids).is("ended_at", null),
  ]);

  // Both lists are sorted, so the first entry per plant is the latest check / soonest watering.
  const firstBy = <T extends { plant_id: string }>(rows: T[] | null) => {
    const map = new Map<string, T>();
    rows?.forEach((r) => map.has(r.plant_id) || map.set(r.plant_id, r));
    return map;
  };
  const latest = firstBy(assessments);
  const water = firstBy(tasks);
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const byId = new Map(plants.map((p) => [p.id, p]));
  const photoFor = (plantId: string) => urls.get(coverPath(byId.get(plantId)!) ?? "") ?? null;

  // Watering due by the end of the user's local day.
  const now = new Date();
  const dueBefore = endOfLocalDay(profile?.timezone ?? "UTC", now).getTime();
  const waterDue: WaterCardProps[] = (tasks ?? [])
    .filter((t) => new Date(t.due_at).getTime() < dueBefore)
    .map((t) => ({
      taskId: t.id,
      plantId: t.plant_id,
      nickname: byId.get(t.plant_id)!.nickname,
      title: t.title,
      detail: t.detail,
      dueAt: t.due_at,
      photoUrl: photoFor(t.plant_id),
    }));

  // Recent AI steps (watering is handled by the reminder above), minus finished groups.
  const recent = [...latest.values()].filter(
    (a) => now.getTime() - new Date(a.created_at).getTime() < STEP_MAX_AGE_DAYS * 86_400_000,
  );
  const { data: ticks } = recent.length
    ? await supabase.from("care_events").select("assessment_id, action_index").in("assessment_id", recent.map((a) => a.id))
    : { data: [] };
  const ticked = new Set((ticks ?? []).map((t) => `${t.assessment_id}:${t.action_index}`));
  const steps: StepGroup[] = recent
    .map((a) => {
      const actions = assessmentSchema.safeParse(a.raw).data?.actions ?? [];
      const items = actions
        .map((act, index) => ({ index, step: act.step, why: act.why, taskType: act.taskType, done: ticked.has(`${a.id}:${index}`) }))
        .filter((i) => i.taskType !== "water");
      return { plantId: a.plant_id, nickname: byId.get(a.plant_id)!.nickname, assessmentId: a.id, items };
    })
    .filter((g) => g.items.some((i) => !i.done));

  const tz = profile?.timezone ?? "UTC";
  const rescues = [
    ...(rescuePlans ?? []).map((r) => {
      const day = rescueDay(new Date(r.started_at), now, tz);
      const open = stepsDueOn(r.steps as RescueStep[], r.progress as Record<string, string>, day).filter((s) => !s.done).length;
      return { id: r.plant_id, nickname: byId.get(r.plant_id)!.nickname, text: `Rescue day ${day}${open ? ` · ${open} step${open > 1 ? "s" : ""} today` : ""}` };
    }),
    ...plants
      .filter((p) => p.status === "er" && !rescuePlans?.some((r) => r.plant_id === p.id))
      .map((p) => ({ id: p.id, nickname: p.nickname, text: "Needs help · start a rescue plan" })),
  ];

  const lastPhoto = firstBy(photos);
  const checkins = plants
    .filter((p) => needsCheckin(lastPhoto.has(p.id) ? new Date(lastPhoto.get(p.id)!.taken_at) : null, now))
    .map((p) => ({ id: p.id, nickname: p.nickname }));

  return (
    <Today
      water={waterDue}
      steps={steps}
      checkins={checkins}
      rescues={rescues}
      trip={trip}
      plants={plants.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        species_name: p.species_name,
        status: p.status,
        photoUrl: photoFor(p.id),
        health: latest.get(p.id)?.health ?? null,
        waterDue: water.get(p.id)?.due_at ?? null,
      }))}
    />
  );
}

function Landing() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <p className="text-5xl">🪴</p>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Snap a photo. Know what your plant needs.</h1>
      <p className="mt-3 text-lg text-muted">
        A health check for every plant, three simple steps for today, and a nudge when it&apos;s thirsty.
      </p>
      <ul className="mt-8 space-y-3 text-base">
        <li className="flex gap-3"><span aria-hidden>📷</span><span>Photo health check: leaves, soil, light, pot and pests</span></li>
        <li className="flex gap-3"><span aria-hidden>💧</span><span>Watering reminders that learn from your plant</span></li>
        <li className="flex gap-3"><span aria-hidden>🪴</span><span>A repot plan as it grows, plus a growth time-lapse</span></li>
        <li className="flex gap-3"><span aria-hidden>🚨</span><span>Rescue plans when something goes wrong</span></li>
        <li className="flex gap-3"><span aria-hidden>✈️</span><span>Vacation prep and a simple link for your plant-sitter</span></li>
      </ul>
      <Link href="/login" className="mt-10 rounded-full bg-leaf py-3 text-center font-medium text-background">
        Get started
      </Link>
    </main>
  );
}

function Today({
  plants,
  water,
  steps,
  checkins,
  rescues,
  trip,
}: {
  plants: PlantRow[];
  water: WaterCardProps[];
  steps: StepGroup[];
  checkins: { id: string; nickname: string }[];
  rescues: { id: string; nickname: string; text: string }[];
  trip: TripView | null;
}) {
  const tripLeft = trip ? trip.items.filter((i) => !i.done && i.when !== "return").length : 0;
  const tripEnd = trip ? new Date(trip.endsAt).toLocaleDateString(undefined, { day: "numeric", month: "long" }) : "";
  const nothingToDo = water.length === 0 && steps.length === 0 && checkins.length === 0 && rescues.length === 0;
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Today</h1>
        <nav className="flex gap-1 text-xl">
          <Link href="/vacation" aria-label="Going away" className="rounded-full p-2">
            ✈️
          </Link>
          <Link href="/shopping" aria-label="Shopping list" className="rounded-full p-2">
            🛒
          </Link>
          <Link href="/circle" aria-label="Care Circle" className="rounded-full p-2">
            👥
          </Link>
          <Link href="/settings" aria-label="Settings" className="rounded-full p-2">
            ⚙️
          </Link>
        </nav>
      </header>
      <div className="mt-4 space-y-3">
        {trip && (
          <Link href="/vacation" className="flex items-center justify-between rounded-2xl border border-border bg-leaf-soft p-4 text-sm">
            <span>
              ✈️{" "}
              {trip.status === "active" ? (
                <>
                  <b>You&apos;re away until {tripEnd}.</b> Your reminders are paused.
                </>
              ) : (
                <>
                  <b>Trip coming up.</b> {tripLeft ? `${tripLeft} prep step${tripLeft > 1 ? "s" : ""} left` : "All prepped!"}
                </>
              )}
            </span>
            <span aria-hidden>→</span>
          </Link>
        )}
        <InstallCoach />
        {plants.length > 0 && <TelegramCard compact />}
      </div>

      {plants.length === 0 ? (
        <section className="mt-10 text-center">
          <p className="text-5xl">🌱</p>
          <h2 className="mt-4 text-xl font-semibold">Add your first plant</h2>
          <p className="mt-2 text-muted">Take a photo and we&apos;ll tell you how it&apos;s doing.</p>
        </section>
      ) : (
        <>
          {nothingToDo && (
            <p className="mt-6 rounded-2xl bg-leaf-soft p-4 text-center">🌿 Nothing to do today. Your plants are all set.</p>
          )}

          {rescues.length > 0 && (
            <section className="mt-6 space-y-2" aria-label="Plant rescues">
              {rescues.map((r) => (
                <Link
                  key={r.id}
                  href={`/plants/${r.id}/rescue`}
                  className="flex items-center justify-between rounded-2xl border border-terracotta bg-terracotta/10 p-4"
                >
                  <span>
                    🚨 <b>{r.nickname}</b> <span className="text-sm text-muted">· {r.text}</span>
                  </span>
                  <span aria-hidden>→</span>
                </Link>
              ))}
            </section>
          )}

          {water.length > 0 && (
            <section className="mt-6 space-y-3" aria-label="Watering">
              {water.map((w) => (
                <WaterCard key={w.taskId} {...w} />
              ))}
            </section>
          )}

          {checkins.length > 0 && (
            <section className="mt-6 rounded-2xl border border-border bg-surface p-4" aria-label="Weekly check-ins">
              <p className="font-semibold">📸 Weekly check-in</p>
              <p className="mt-1 text-sm text-muted">One photo each updates the health check and the growth time-lapse.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {checkins.map((c) => (
                  <Link key={c.id} href={`/plants/${c.id}/checkin`} className="rounded-full bg-leaf-soft px-3 py-1.5 text-sm font-medium">
                    {c.nickname} →
                  </Link>
                ))}
              </div>
            </section>
          )}

          {steps.map((g) => (
            <section key={g.assessmentId} className="mt-6">
              <h2 className="mb-2 font-semibold">
                <Link href={`/plants/${g.plantId}`} className="hover:underline">
                  {g.nickname}
                </Link>
              </h2>
              <StepList plantId={g.plantId} assessmentId={g.assessmentId} items={g.items} />
            </section>
          ))}

          <h2 className="mt-10 text-lg font-semibold">My plants</h2>
          <ul className="mt-3 space-y-3">
            {plants.map((p) => {
              const due = p.waterDue ? new Date(p.waterDue) : null;
              return (
                <li key={p.id}>
                  <Link
                    href={`/plants/${p.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-3"
                  >
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                      <img src={p.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-leaf-soft text-2xl">🪴</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {p.status === "er" && "🚨 "}
                        {p.nickname}
                      </p>
                      {p.species_name && <p className="truncate text-sm italic text-muted">{p.species_name}</p>}
                      {due && <p className="mt-0.5 text-sm text-muted">💧 Water {dueLabel(due)}</p>}
                    </div>
                    {p.health != null && <HealthBadge value={p.health} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Link
        href="/plants/new"
        aria-label="Add a plant"
        className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full bg-leaf text-3xl text-background shadow-lg"
      >
        📷
      </Link>
    </main>
  );
}
