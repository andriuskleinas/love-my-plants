import Link from "next/link";
import { notFound } from "next/navigation";
import { HealthTrend } from "@/components/health-trend";
import { ReportCard } from "@/components/report-card";
import { StepList } from "@/components/step-list";
import { Timelapse, type Frame } from "@/components/timelapse";
import { WaterCard } from "@/components/water-card";
import { assessmentSchema } from "@/lib/ai/schemas";
import { daysSince, needsCheckin } from "@/lib/care/plan";
import { planLength, rescueDay, stepsDueOn, type RescueStep } from "@/lib/care/rescue";
import { refreshPlantPlan } from "@/lib/care/plan.server";
import { endOfLocalDay } from "@/lib/care/schedule";
import type { Hemisphere } from "@/lib/care/watering";
import { dueLabel } from "@/lib/plants/format";
import { PHOTO_BUCKET } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";
import { DeletePlantButton } from "./delete-button";
import { PlanSection } from "./plan-section";

export default async function PlantPage({ params }: PageProps<"/plants/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: plant } = await supabase
    .from("plants")
    .select("id, nickname, species_name, species_id, status, pot_diameter_cm, cover:photos!plants_cover_photo_fk(storage_path)")
    .eq("id", id)
    .maybeSingle();
  if (!plant) notFound();

  const [{ data: latest }, { data: waterTask }, { data: care }] = await Promise.all([
    supabase
      .from("assessments")
      .select("id, raw, created_at")
      .eq("plant_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("care_tasks")
      .select("id, title, detail, due_at")
      .eq("plant_id", id)
      .eq("type", "water")
      .in("status", ["pending", "snoozed"])
      .order("due_at")
      .limit(1)
      .maybeSingle(),
    plant.species_id
      ? supabase
          .from("species_profiles")
          .select("common_name, light, humidity, temperature, fertilizer, soil_mix, toxic_to_pets")
          .eq("id", plant.species_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const cover = Array.isArray(plant.cover) ? plant.cover[0] : plant.cover;
  const coverUrl = cover
    ? (await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(cover.storage_path, 3600)).data?.signedUrl
    : null;
  const assessment = latest ? assessmentSchema.safeParse(latest.raw) : null;

  const { data: claims } = await supabase.auth.getClaims();
  const [{ data: profile }, { data: ticks }, { data: history }, { data: photos }, milestonesResult] = await Promise.all([
    supabase.from("profiles").select("timezone, hemisphere").eq("id", claims?.claims?.sub ?? "").maybeSingle(),
    latest
      ? supabase.from("care_events").select("action_index").eq("assessment_id", latest.id)
      : Promise.resolve({ data: [] as { action_index: number }[] }),
    supabase
      .from("assessments")
      .select("created_at, health, estimated_height_cm, photo_ids")
      .eq("plant_id", id)
      .order("created_at"),
    supabase
      .from("photos")
      .select("id, storage_path, kind, taken_at")
      .eq("plant_id", id)
      .order("taken_at"),
    supabase.from("milestones").select("type, target_date, details").eq("plant_id", id),
  ]);
  const { data: rescue } = await supabase
    .from("rescue_plans")
    .select("started_at, steps, progress")
    .eq("plant_id", id)
    .is("ended_at", null)
    .maybeSingle();
  const rescueSteps = (rescue?.steps ?? []) as RescueStep[];
  const rescueToday = rescue ? rescueDay(new Date(rescue.started_at), new Date(), profile?.timezone ?? "UTC") : 0;
  const rescueOpen = rescue
    ? stepsDueOn(rescueSteps, rescue.progress as Record<string, string>, rescueToday).filter((s) => !s.done).length
    : 0;
  let milestones = milestonesResult.data ?? [];
  // Plants checked before plans existed get theirs on first view.
  if (!milestones.length && latest) {
    await refreshPlantPlan(id, (profile?.hemisphere ?? "north") as Hemisphere);
    milestones = (await supabase.from("milestones").select("type, target_date, details").eq("plant_id", id)).data ?? [];
  }

  // Time-lapse: whole-plant and check-in photos, each with the height estimated from it.
  const heightByPhoto = new Map<string, number | null>();
  history?.forEach((a) => (a.photo_ids as string[]).forEach((pid) => heightByPhoto.set(pid, a.estimated_height_cm)));
  const framePhotos = (photos ?? []).filter((p) => p.kind === "whole" || p.kind === "checkin");
  const { data: frameUrls } = framePhotos.length
    ? await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(framePhotos.map((p) => p.storage_path), 3600)
    : { data: [] };
  const frames: Frame[] = framePhotos
    .map((p, i) => ({ url: frameUrls?.[i]?.signedUrl ?? "", date: p.taken_at, heightCm: heightByPhoto.get(p.id) ?? null }))
    .filter((f) => f.url);
  const lastPhotoAt = photos?.length ? new Date(photos.at(-1)!.taken_at) : null;
  const checkinDue = needsCheckin(lastPhotoAt, new Date());
  const waterDueToday =
    waterTask && new Date(waterTask.due_at).getTime() < endOfLocalDay(profile?.timezone ?? "UTC", new Date()).getTime();
  const ticked = new Set((ticks ?? []).map((t) => t.action_index));

  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-16">
      <div className="relative">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={coverUrl} alt={plant.nickname} className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-leaf-soft text-6xl">🪴</div>
        )}
        <Link
          href="/plants"
          className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-background/90 px-3 py-1.5 text-sm"
        >
          ← Plants
        </Link>
      </div>

      <div className="px-4 pt-5">
        <h1 className="text-2xl font-semibold">
          {plant.status === "er" && "🚨 "}
          {plant.nickname}
        </h1>
        {plant.species_name && <p className="italic text-muted">{plant.species_name}</p>}

        {rescue ? (
          <Link
            href={`/plants/${plant.id}/rescue`}
            className="mt-4 flex items-center justify-between rounded-2xl border border-terracotta bg-terracotta/10 p-3 text-sm"
          >
            <span>
              🚨 <b>Rescue day {Math.min(rescueToday, planLength(rescueSteps))} of {planLength(rescueSteps)}</b>
              <span className="text-muted"> · {rescueOpen ? `${rescueOpen} step${rescueOpen > 1 ? "s" : ""} today` : "nothing to do today"}</span>
            </span>
            <span aria-hidden>→</span>
          </Link>
        ) : plant.status === "er" ? (
          <Link
            href={`/plants/${plant.id}/rescue`}
            className="mt-4 flex items-center justify-between rounded-2xl border border-terracotta bg-terracotta/10 p-3 text-sm"
          >
            <span>
              🚨 <b>{plant.nickname} needs help.</b> <span className="text-muted">Start a rescue plan</span>
            </span>
            <span aria-hidden>→</span>
          </Link>
        ) : null}

        <Link
          href={`/plants/${plant.id}/checkin`}
          className={`mt-4 flex items-center justify-between rounded-2xl border p-3 text-sm ${
            checkinDue ? "border-leaf bg-leaf-soft" : "border-border bg-surface"
          }`}
        >
          <span>
            📸 <b>{checkinDue ? "Weekly check-in due" : "New check-in"}</b>
            {lastPhotoAt && <span className="text-muted"> · last photo {daysSince(lastPhotoAt, new Date())} days ago</span>}
          </span>
          <span aria-hidden>→</span>
        </Link>

        {waterTask && waterDueToday && (
          <div className="mt-4">
            <WaterCard
              taskId={waterTask.id}
              plantId={plant.id}
              nickname={plant.nickname}
              title={waterTask.title}
              detail={waterTask.detail}
              dueAt={waterTask.due_at}
              showPlantLink={false}
            />
          </div>
        )}
        {waterTask && !waterDueToday && (
          <p className="mt-4 rounded-2xl bg-leaf-soft p-3 text-sm">
            💧 Next watering <b>{dueLabel(new Date(waterTask.due_at))}</b>: {waterTask.title.toLowerCase()}
          </p>
        )}

        <div className="mt-8">
          {assessment?.success ? (
            <>
              <p className="mb-4 text-xs text-muted">
                Checked {new Date(latest!.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long" })}
              </p>
              <ReportCard
                scores={assessment.data.scores}
                issues={assessment.data.issues}
                actions={assessment.data.actions}
                today={
                  <StepList
                    plantId={plant.id}
                    assessmentId={latest!.id}
                    items={assessment.data.actions.map((a, index) => ({
                      index,
                      step: a.step,
                      why: a.why,
                      done: ticked.has(index),
                    }))}
                  />
                }
              />
            </>
          ) : (
            <div className="rounded-2xl border border-border bg-surface p-4 text-center">
              <p className="font-medium">No health check yet</p>
              <p className="mt-1 text-sm text-muted">This plant was added but its photo check didn&apos;t finish.</p>
            </div>
          )}
        </div>

        {history && history.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">Progress</h2>
            <div className="mt-3 space-y-3">
              <HealthTrend
                points={history.map((a) => ({ date: a.created_at, health: a.health, heightCm: a.estimated_height_cm }))}
              />
              <Timelapse frames={frames} />
            </div>
          </section>
        )}

        <PlanSection
          plantId={plant.id}
          potCm={Number(plant.pot_diameter_cm)}
          milestones={milestones}
          fertilizer={care?.fertilizer ?? null}
        />

        {care && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">Care sheet</h2>
            <dl className="mt-3 divide-y divide-border rounded-2xl border border-border bg-surface text-sm">
              {[
                ["☀️ Light", care.light],
                ["💦 Humidity", care.humidity],
                ["🌡️ Temperature", care.temperature],
                ["🌱 Feeding", care.fertilizer],
                ["🪴 Soil", care.soil_mix],
                [
                  "🐾 Pets",
                  care.toxic_to_pets == null
                    ? "Unknown, so keep it out of reach to be safe"
                    : care.toxic_to_pets
                      ? "Toxic to cats and dogs; keep out of reach"
                      : "Generally safe for pets",
                ],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex gap-3 p-3">
                    <dt className="w-32 shrink-0 text-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
          </section>
        )}

        {!rescue && plant.status !== "er" && (
          <Link href={`/plants/${plant.id}/rescue`} className="mt-10 block text-sm font-medium text-terracotta">
            🚨 Something looks wrong? Start a Plant ER check →
          </Link>
        )}

        <div className="mt-12">
          <DeletePlantButton id={plant.id} nickname={plant.nickname} />
        </div>
      </div>
    </main>
  );
}
