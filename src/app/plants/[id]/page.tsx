import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportCard } from "@/components/report-card";
import { StepList } from "@/components/step-list";
import { WaterCard } from "@/components/water-card";
import { assessmentSchema } from "@/lib/ai/schemas";
import { endOfLocalDay } from "@/lib/care/schedule";
import { dueLabel } from "@/lib/plants/format";
import { PHOTO_BUCKET } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";
import { DeletePlantButton } from "./delete-button";

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
  const [{ data: profile }, { data: ticks }] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", claims?.claims?.sub ?? "").maybeSingle(),
    latest
      ? supabase.from("care_events").select("action_index").eq("assessment_id", latest.id)
      : Promise.resolve({ data: [] as { action_index: number }[] }),
  ]);
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
          href="/"
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

        <div className="mt-12">
          <DeletePlantButton id={plant.id} nickname={plant.nickname} />
        </div>
      </div>
    </main>
  );
}
