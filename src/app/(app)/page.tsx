import Link from "next/link";
import { LogoMark } from "@/components/brand/marks";
import { SuitcaseIcon } from "@/components/icons";
import { InstallCoach } from "@/components/install-coach";
import { Landing } from "@/components/landing/landing";
import { scoreTone } from "@/components/report-card";
import { TelegramCard } from "@/components/telegram-card";
import { ProgressRing } from "@/components/today/progress-ring";
import { TaskList } from "@/components/today/task-list";
import { assessmentSchema } from "@/lib/ai/schemas";
import { needsCheckin } from "@/lib/care/plan";
import { rescueDay, stepsDueOn, type RescueStep } from "@/lib/care/rescue";
import { endOfLocalDay } from "@/lib/care/schedule";
import { comingUp, dayLabel, daysAhead, greeting, longDate, orderTasks, type ComingUp, type TodayTask } from "@/lib/care/today";
import { loadTrip, type TripView } from "@/lib/care/vacation.server";
import { PHOTO_BUCKET } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

const isConfigured = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Steps from checks older than this no longer show on Today. */
const STEP_MAX_AGE_DAYS = 14;

type PlantChip = { id: string; nickname: string; photoUrl: string | null; health: number | null; urgent: boolean };

export default async function Home() {
  if (!isConfigured()) return <Landing />;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return <Landing />;

  const [{ data: plants }, { data: profile }] = await Promise.all([
    supabase
      .from("plants")
      .select("id, nickname, status, cover:photos!plants_cover_photo_fk(storage_path)")
      .neq("status", "archived")
      .order("created_at"),
    supabase.from("profiles").select("timezone, display_name").eq("id", userId).maybeSingle(),
  ]);
  const tz = profile?.timezone ?? "UTC";
  const now = new Date();
  const header = { greeting: greeting(tz, now, profile?.display_name), date: longDate(tz, now) };
  if (!plants?.length) return <Today header={header} tz={tz} now={now} plants={[]} tasks={[]} done={0} coming={[]} trip={null} />;

  const ids = plants.map((p) => p.id);
  const coverPath = (p: (typeof plants)[number]) =>
    (Array.isArray(p.cover) ? p.cover[0] : p.cover)?.storage_path as string | undefined;
  const paths = plants.map(coverPath).filter((x): x is string => !!x);
  const endOfToday = endOfLocalDay(tz, now);
  const startOfToday = new Date(endOfToday.getTime() - 86_400_000);

  const [
    trip,
    { data: assessments },
    { data: tasks },
    { data: signed },
    { data: photos },
    { data: rescuePlans },
    { data: doneEvents },
    { data: repots },
  ] = await Promise.all([
    loadTrip(supabase, userId, now),
    supabase.from("assessments").select("id, plant_id, health, raw, created_at").in("plant_id", ids).order("created_at", { ascending: false }),
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
    supabase.from("photos").select("plant_id, kind, taken_at").in("plant_id", ids).order("taken_at", { ascending: false }),
    supabase.from("rescue_plans").select("plant_id, started_at, steps, progress").in("plant_id", ids).is("ended_at", null),
    // Waterings and ticked steps since local midnight, for today's progress.
    supabase.from("care_events").select("id").in("plant_id", ids).gte("done_at", startOfToday.toISOString()),
    supabase.from("milestones").select("plant_id, target_date").in("plant_id", ids).eq("type", "repot").is("done_at", null),
  ]);

  // Sorted lists, so the first entry per plant is the latest check / photo / soonest watering.
  const firstBy = <T extends { plant_id: string }>(rows: T[] | null) => {
    const map = new Map<string, T>();
    rows?.forEach((r) => map.has(r.plant_id) || map.set(r.plant_id, r));
    return map;
  };
  const latest = firstBy(assessments);
  const lastPhoto = firstBy(photos);
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const byId = new Map(plants.map((p) => [p.id, p]));
  const photoFor = (plantId: string) => urls.get(coverPath(byId.get(plantId)!) ?? "") ?? null;
  const plantBits = (plantId: string) => ({ plantId, nickname: byId.get(plantId)!.nickname, photoUrl: photoFor(plantId) });

  const todo: TodayTask[] = [];

  for (const r of rescuePlans ?? []) {
    const day = rescueDay(new Date(r.started_at), now, tz);
    const open = stepsDueOn(r.steps as RescueStep[], r.progress as Record<string, string>, day).filter((s) => !s.done).length;
    todo.push({ kind: "rescue", key: `r${r.plant_id}`, ...plantBits(r.plant_id), text: `Rescue day ${day}${open ? ` · ${open} step${open > 1 ? "s" : ""} today` : ""}` });
  }
  for (const p of plants) {
    if (p.status === "er" && !rescuePlans?.some((r) => r.plant_id === p.id)) {
      todo.push({ kind: "rescue", key: `r${p.id}`, ...plantBits(p.id), text: "Needs help: start a rescue plan" });
    }
  }

  // Watering due by the end of the user's local day.
  for (const t of tasks ?? []) {
    if (new Date(t.due_at) >= endOfToday) continue;
    todo.push({
      kind: "water",
      key: `w${t.id}`,
      ...plantBits(t.plant_id),
      taskId: t.id,
      title: t.title,
      detail: t.detail,
      dueAt: t.due_at,
      overdue: new Date(t.due_at) < startOfToday,
    });
  }

  for (const p of plants) {
    const last = lastPhoto.get(p.id);
    if (needsCheckin(last ? new Date(last.taken_at) : null, now)) todo.push({ kind: "checkin", key: `c${p.id}`, ...plantBits(p.id) });
  }

  // The AI's recent steps that aren't ticked yet (watering has its own reminder above).
  const recent = [...latest.values()].filter((a) => now.getTime() - new Date(a.created_at).getTime() < STEP_MAX_AGE_DAYS * 86_400_000);
  const { data: ticks } = recent.length
    ? await supabase.from("care_events").select("assessment_id, action_index").in("assessment_id", recent.map((a) => a.id))
    : { data: [] };
  const ticked = new Set((ticks ?? []).map((t) => `${t.assessment_id}:${t.action_index}`));
  for (const a of recent) {
    (assessmentSchema.safeParse(a.raw).data?.actions ?? []).forEach((act, index) => {
      if (act.taskType === "water" || ticked.has(`${a.id}:${index}`)) return;
      todo.push({ kind: "step", key: `s${a.id}:${index}`, ...plantBits(a.plant_id), assessmentId: a.id, index, step: act.step, why: act.why });
    });
  }

  const checkinsToday = (photos ?? []).filter((p) => p.kind === "checkin" && new Date(p.taken_at) >= startOfToday).length;
  const nextWater = new Map<string, string>();
  (tasks ?? []).forEach((t) => nextWater.has(t.plant_id) || nextWater.set(t.plant_id, t.due_at));
  const coming = comingUp(
    {
      water: [...nextWater].map(([plantId, dueAt]) => ({ plantId, nickname: byId.get(plantId)!.nickname, dueAt })),
      lastPhotos: plants.map((p) => ({ plantId: p.id, nickname: p.nickname, takenAt: lastPhoto.get(p.id)?.taken_at ?? null })),
      repots: (repots ?? []).map((m) => ({ plantId: m.plant_id, nickname: byId.get(m.plant_id)!.nickname, targetDate: m.target_date })),
      trip: trip?.status === "upcoming" ? trip : null,
    },
    tz,
    now,
  );

  const urgentIds = new Set(todo.filter((t) => t.kind === "rescue" || t.kind === "water").map((t) => t.plantId));
  return (
    <Today
      header={header}
      tz={tz}
      now={now}
      tasks={orderTasks(todo)}
      done={(doneEvents?.length ?? 0) + checkinsToday}
      coming={coming}
      trip={trip}
      plants={plants.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        photoUrl: photoFor(p.id),
        health: latest.get(p.id)?.health ?? null,
        urgent: urgentIds.has(p.id),
      }))}
    />
  );
}

function Today({
  header,
  tz,
  now,
  plants,
  tasks,
  done,
  coming,
  trip,
}: {
  header: { greeting: string; date: string };
  tz: string;
  now: Date;
  plants: PlantChip[];
  tasks: TodayTask[];
  done: number;
  coming: ComingUp[];
  trip: TripView | null;
}) {
  const total = done + tasks.length;
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="lg:hidden">
              <LogoMark size={20} title={null} />
            </span>
            {header.date}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{header.greeting}</h1>
        </div>
        {plants.length > 0 && total > 0 && <ProgressRing done={done} total={total} />}
      </header>

      {trip && <TripStatus trip={trip} tz={tz} now={now} />}

      {plants.length === 0 ? (
        <section className="mt-10 text-center">
          <p className="text-5xl">🌱</p>
          <h2 className="mt-4 text-xl font-semibold">Add your first plant</h2>
          <p className="mt-2 text-muted">Take a photo and we&apos;ll tell you how it&apos;s doing.</p>
          <Link href="/plants/new" className="mt-6 inline-block rounded-full bg-leaf px-6 py-3 font-medium text-background">
            Add a plant
          </Link>
        </section>
      ) : (
        <>
          {tasks.length > 0 ? (
            <section className="mt-6" aria-labelledby="todo-heading">
              <h2 id="todo-heading" className="mb-3 flex items-baseline justify-between text-lg font-semibold">
                To do
                <span className="text-sm font-normal text-muted">{tasks.length} left</span>
              </h2>
              <TaskList tasks={tasks} />
            </section>
          ) : (
            <AllDone done={done} next={coming[0]} tz={tz} now={now} />
          )}

          {coming.length > 0 && (
            <section className="mt-8" aria-labelledby="coming-heading">
              <h2 id="coming-heading" className="mb-3 text-lg font-semibold">
                Coming up
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {coming.map((c) => (
                  <li key={c.key}>
                    <Link href={c.href} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-background">
                      <span className="w-20 shrink-0 text-muted">{dayLabel(tz, now, new Date(c.date))}</span>
                      <span aria-hidden>{c.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{c.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <PlantStrip plants={plants} />

          <div className="mt-8 space-y-3 empty:hidden">
            <TelegramCard compact />
            <InstallCoach />
          </div>
        </>
      )}
    </main>
  );
}

function AllDone({ done, next, tz, now }: { done: number; next?: ComingUp; tz: string; now: Date }) {
  const when = next ? dayLabel(tz, now, new Date(next.date)) : null;
  return (
    <section className="mt-6 rounded-3xl bg-leaf-soft px-5 py-8 text-center" aria-label="All done">
      <p className="text-5xl" aria-hidden>
        🌿
      </p>
      <h2 className="mt-3 text-xl font-semibold">{done ? "All done for today" : "Nothing to do today"}</h2>
      <p className="mt-1 text-muted">
        {done ? `You finished ${done} ${done === 1 ? "thing" : "things"} today. Your plants thank you.` : "Your plants are all set."}
      </p>
      {next && when && (
        <p className="mt-4 text-sm">
          Next: <b>{next.text}</b> {when === "Tomorrow" ? "tomorrow" : `on ${when}`}.
        </p>
      )}
    </section>
  );
}

function TripStatus({ trip, tz, now }: { trip: TripView; tz: string; now: Date }) {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short" });
  const left = trip.items.filter((i) => !i.done && i.when !== "return").length;
  const days = daysAhead(tz, now, new Date(trip.startsAt));
  const when = days <= 0 ? "Trip starts today" : days === 1 ? "Trip tomorrow" : `Trip in ${days} days`;
  return (
    <Link href="/vacation" className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
      <SuitcaseIcon size={20} className="shrink-0 text-leaf" />
      <span className="min-w-0 flex-1">
        {trip.status === "active" ? (
          <>
            <b>Away until {fmt(trip.endsAt)}.</b> <span className="text-muted">Your reminders are paused.</span>
          </>
        ) : (
          <>
            <b>{when}</b> <span className="text-muted">({fmt(trip.startsAt)} – {fmt(trip.endsAt)})</span>
            <span className="block text-muted">{left ? `${left} prep step${left > 1 ? "s" : ""} left` : "All prepped!"}</span>
          </>
        )}
      </span>
      <span aria-hidden className="text-muted">
        →
      </span>
    </Link>
  );
}

function PlantStrip({ plants }: { plants: PlantChip[] }) {
  return (
    <section className="mt-8" aria-labelledby="plants-heading">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="plants-heading" className="text-lg font-semibold">
          Your plants
        </h2>
        <Link href="/plants" className="text-sm font-medium text-leaf">
          See all
        </Link>
      </div>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {plants.map((p) => (
          <li key={p.id} className="w-20 shrink-0">
            <Link href={`/plants/${p.id}`} className="block text-center">
              <span className="relative block">
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  <img src={p.photoUrl} alt="" className="h-20 w-20 rounded-2xl object-cover" />
                ) : (
                  <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-leaf-soft text-3xl">🪴</span>
                )}
                {p.health != null && (
                  <span
                    className={`absolute -right-1 -top-1 flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-background bg-surface px-1 text-[11px] font-semibold ${scoreTone(p.health).text}`}
                    aria-label={`Health ${p.health}: ${scoreTone(p.health).label}`}
                  >
                    {p.health}
                  </span>
                )}
                {p.urgent && <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-background bg-terracotta" role="img" aria-label="Needs you today" />}
              </span>
              <span className="mt-1.5 block truncate text-xs font-medium">{p.nickname}</span>
            </Link>
          </li>
        ))}
        <li className="w-20 shrink-0">
          <Link href="/plants/new" className="block text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-border text-2xl text-muted">+</span>
            <span className="mt-1.5 block text-xs text-muted">Add</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
