import Link from "next/link";
import { notFound } from "next/navigation";
import { HealthTrend } from "@/components/health-trend";
import { PlantPicture } from "@/components/plant-picture";
import { BackIcon, ImageIcon, PencilIcon, TrendIcon } from "@/components/icons";
import { HealthBadge, ReportCard, scoreTone } from "@/components/report-card";
import { StepList } from "@/components/step-list";
import { TipList, type TipItem } from "@/components/today/tip-list";
import { Timelapse, type Frame } from "@/components/timelapse";
import { WaterCard } from "@/components/water-card";
import { parseAssessment } from "@/lib/ai/schemas";
import { careEmoji, careEventText } from "@/lib/care/log";
import { needsCheckin } from "@/lib/care/plan";
import { planLength, rescueDay, stepsDueOn, type RescueStep } from "@/lib/care/rescue";
import { refreshPlantPlan } from "@/lib/care/plan.server";
import { endOfLocalDay, localTime } from "@/lib/care/schedule";
import type { Hemisphere } from "@/lib/care/watering";
import { dueLabel } from "@/lib/plants/format";
import { cutoutConfigured } from "@/lib/plants/cutout.server";
import { CUTTABLE_KINDS, pictureUrl, PICTURE_KINDS, PICTURE_ONLY_KINDS } from "@/lib/plants/pictures";
import { PHOTO_BUCKET } from "@/lib/plants/server";
import { creditLine, type PhotoCredit } from "@/lib/plants/stock-photos";
import { createClient } from "@/lib/supabase/server";
import { healthTrend } from "@/lib/plants/collection";
import { LogCareLink } from "@/components/log-care-sheet";
import { PlanSection } from "./plan-section";
import { OpenSheetButton, PlantActions } from "./plant-actions";
import { SectionNav, type Section } from "./section-nav";

const HISTORY_SHOWN = 15;

export default async function PlantPage({ params }: PageProps<"/plants/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: plant } = await supabase
    .from("plants")
    .select(
      "id, home_id, nickname, species_name, species_id, status, pot_diameter_cm, cover_photo_id, cover_pinned, cover:photos!plants_cover_photo_fk(storage_path, kind, credit)",
    )
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
  const coverSigned = cover
    ? (await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(cover.storage_path, 3600)).data?.signedUrl
    : null;
  const coverUrl = cover && coverSigned ? pictureUrl(coverSigned, cover.kind) : null;
  const assessment = latest ? parseAssessment(latest.raw) : undefined;

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? "";
  const [
    { data: profile },
    { data: ticks },
    { data: history },
    { data: photos },
    milestonesResult,
    { data: careLog },
    { data: lastFed },
    { data: tipAnswers },
  ] = await Promise.all([
    supabase.from("profiles").select("timezone, hemisphere").eq("id", userId).maybeSingle(),
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
    supabase
      .from("care_events")
      .select("id, type, note, soil_feedback, done_at, member:home_members(display_name, user_id)")
      .eq("plant_id", id)
      .order("done_at", { ascending: false })
      .limit(HISTORY_SHOWN),
    supabase
      .from("care_events")
      .select("done_at")
      .eq("plant_id", id)
      .eq("type", "fertilize")
      .order("done_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    latest
      ? supabase.from("tip_answers").select("action_index, answer, note").eq("assessment_id", latest.id)
      : Promise.resolve({ data: [] as { action_index: number; answer: "done" | "cant" | "later"; note: string | null }[] }),
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

  // Photos that can be the plant's picture; the whole-plant and check-in ones also make the time-lapse.
  const picturePhotos = (photos ?? []).filter((p) => (PICTURE_KINDS as readonly string[]).includes(p.kind));
  const { data: pictureUrls } = picturePhotos.length
    ? await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(picturePhotos.map((p) => p.storage_path), 3600)
    : { data: [] };
  const urlById = new Map(picturePhotos.map((p, i) => [p.id, pictureUrls?.[i]?.signedUrl ?? ""]));

  // Time-lapse: each frame with the height estimated from it.
  const heightByPhoto = new Map<string, number | null>();
  history?.forEach((a) => (a.photo_ids as string[]).forEach((pid) => heightByPhoto.set(pid, a.estimated_height_cm)));
  const frames: Frame[] = picturePhotos
    .filter((p) => p.kind === "whole" || p.kind === "checkin")
    .map((p) => ({ url: urlById.get(p.id) ?? "", date: p.taken_at, heightCm: heightByPhoto.get(p.id) ?? null }))
    .filter((f) => f.url);
  const checkinPhotos = (photos ?? []).filter((p) => !(PICTURE_ONLY_KINDS as readonly string[]).includes(p.kind));
  const lastPhotoAt = checkinPhotos.length ? new Date(checkinPhotos.at(-1)!.taken_at) : null;
  const coverCredit = cover?.kind === "stock" ? (cover.credit as PhotoCredit | null) : null;
  const checkinDue = needsCheckin(lastPhotoAt, new Date());
  const waterDueToday =
    waterTask && new Date(waterTask.due_at).getTime() < endOfLocalDay(profile?.timezone ?? "UTC", new Date()).getTime();
  const ticked = new Set((ticks ?? []).map((t) => t.action_index));

  const answerByIndex = new Map((tipAnswers ?? []).map((a) => [a.action_index, a]));
  const actions = (assessment?.actions ?? []).map((a, index) => ({ ...a, index }));
  const todos = actions
    .filter((a) => a.kind === "todo")
    .map((a) => ({ index: a.index, step: a.step, why: a.why, done: ticked.has(a.index) }));
  const tips: TipItem[] = actions
    .filter((a) => a.kind === "tip")
    .map((a) => {
      const answer = answerByIndex.get(a.index);
      return {
        key: `t${a.index}`,
        plantId: plant.id,
        nickname: plant.nickname,
        photoUrl: null,
        assessmentId: latest!.id,
        index: a.index,
        title: a.title,
        step: a.step,
        why: a.why,
        answered: answer ? { answer: answer.answer, note: answer.note } : null,
      };
    });

  const tz = profile?.timezone ?? "UTC";
  const health = assessment ? assessment.scores.health : null;
  const previousHealth = history && history.length > 1 ? history.at(-2)!.health : null;
  const trend = health ? healthTrend(health.value, previousHealth) : null;
  const tone = health ? scoreTone(health.value) : null;
  const checkedOn = latest
    ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "long" }).format(new Date(latest.created_at))
    : null;
  const hasPlan = milestones.some((m) => m.type === "repot" || m.type === "fertilize_season");
  const sections: Section[] = [
    { id: "today", label: "Today" },
    ...(history?.length ? [{ id: "progress", label: "Progress" }] : []),
    ...(hasPlan ? [{ id: "plan", label: "Plan" }] : []),
    ...(careLog?.length ? [{ id: "history", label: "History" }] : []),
    ...(care ? [{ id: "care", label: "Care sheet" }] : []),
  ];
  const now = new Date();
  const todayLocal = localTime(tz, now).date;
  const yesterdayLocal = localTime(tz, new Date(now.getTime() - 86_400_000)).date;
  const historyDay = (iso: string) => {
    const day = localTime(tz, new Date(iso)).date;
    if (day === todayLocal) return "Today";
    if (day === yesterdayLocal) return "Yesterday";
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" }).format(new Date(iso));
  };

  return (
    <main className="mx-auto w-full max-w-md flex-1 lg:max-w-2xl lg:pt-6">
      <div className="relative">
        {coverUrl ? (
          <PlantPicture url={coverUrl} alt={plant.nickname} className="aspect-[4/3] w-full lg:aspect-[16/9] lg:rounded-3xl" />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-leaf-soft text-6xl lg:aspect-[16/9] lg:rounded-3xl">🪴</div>
        )}
        <OpenSheetButton
          sheet="picture"
          aria-label={`Change the picture of ${plant.nickname}`}
          className="absolute bottom-3 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 shadow-sm lg:right-3"
        >
          <ImageIcon size={20} />
        </OpenSheetButton>
        <Link
          href="/plants"
          aria-label="Back to Plants"
          className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-background/90 shadow-sm"
        >
          <BackIcon size={22} />
        </Link>
      </div>

      {coverCredit && (
        <p className="truncate px-4 pt-1.5 text-right text-xs text-muted">
          <a href={coverCredit.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
            {creditLine(coverCredit)} · Wikimedia Commons
          </a>
        </p>
      )}

      <div className="px-4 pt-5">
        <h1 className="flex items-start gap-1 text-2xl font-semibold">
          <span className="min-w-0 break-words">
            {plant.status === "er" && "🚨 "}
            {plant.nickname}
          </span>
          <OpenSheetButton sheet="rename" aria-label={`Rename ${plant.nickname}`} className="-my-1 shrink-0 rounded-full p-2 text-muted hover:text-leaf">
            <PencilIcon size={18} />
          </OpenSheetButton>
        </h1>
        {plant.species_name && <p className="italic text-muted">{plant.species_name}</p>}

        {health && tone && (
          <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-3">
              <HealthBadge value={health.value} />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 font-semibold">
                  <span className={tone.text}>{tone.label}</span>
                  {trend && previousHealth != null && (
                    <span className="flex items-center gap-1 text-sm font-normal text-muted">
                      <TrendIcon trend={trend} size={16} strokeWidth={2.2} className={tone.text} />
                      {trend === "steady" ? "about the same as last time" : `${trend} from ${previousHealth}`}
                    </span>
                  )}
                </p>
                {checkedOn && <p className="text-sm text-muted">Checked {checkedOn}</p>}
              </div>
            </div>
            <p className="mt-3 text-sm">{health.why}</p>
          </div>
        )}

        <SectionNav sections={sections} />

        <section id="today" className="scroll-mt-20" aria-label="Today">
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

          {waterTask && waterDueToday && (
            <div id="water" className="mt-4 scroll-mt-24">
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
              <br />
              <span className="text-muted">Soil already dry and you watered it? </span>
              <LogCareLink type="water">Log it</LogCareLink>
            </p>
          )}

          <div className="mt-6">
            {assessment ? (
              <ReportCard
                showHealth={false}
                scores={assessment.scores}
                issues={assessment.issues}
                actions={assessment.actions}
                today={
                  <>
                    {todos.length > 0 ? (
                      <StepList plantId={plant.id} assessmentId={latest!.id} items={todos} />
                    ) : (
                      <p className="rounded-2xl bg-leaf-soft p-3 text-sm">Nothing else to do today.</p>
                    )}
                    {tips.length > 0 && (
                      <div className="mt-5">
                        <h3 className="mb-2 font-semibold">Tips</h3>
                        <TipList tips={tips} onPlantPage />
                      </div>
                    )}
                  </>
                }
              />
            ) : (
              <div className="rounded-2xl border border-border bg-surface p-4 text-center">
                <p className="font-medium">No health check yet</p>
                <p className="mt-1 text-sm text-muted">This plant was added but its photo check didn&apos;t finish. A check-in will run it again.</p>
              </div>
            )}
          </div>
        </section>

        {history && history.length > 0 && (
          <section id="progress" className="mt-10 scroll-mt-20">
            <h2 className="text-lg font-semibold">Progress</h2>
            <div className="mt-3 space-y-3">
              <HealthTrend
                points={history.map((a) => ({ date: a.created_at, health: a.health, heightCm: a.estimated_height_cm }))}
              />
              <Timelapse frames={frames} />
            </div>
          </section>
        )}

        {hasPlan && (
          <div id="plan" className="scroll-mt-20">
            <PlanSection
              plantId={plant.id}
              potCm={Number(plant.pot_diameter_cm)}
              milestones={milestones}
              fertilizer={care?.fertilizer ?? null}
              lastFedAt={lastFed?.done_at ?? null}
            />
          </div>
        )}

        {careLog && careLog.length > 0 && (
          <section id="history" className="mt-10 scroll-mt-20">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">History</h2>
              <LogCareLink>+ Log care</LogCareLink>
            </div>
            <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-surface text-sm">
              {careLog.map((e) => {
                const member = Array.isArray(e.member) ? e.member[0] : e.member;
                return (
                  <li key={e.id} className="flex gap-3 p-3">
                    <span aria-hidden className="shrink-0">
                      {careEmoji(e.type)}
                    </span>
                    <span className="min-w-0 flex-1">
                      {careEventText(e)}
                      {member && member.user_id !== userId && <span className="text-muted"> · by {member.display_name}</span>}
                    </span>
                    <span className="shrink-0 text-muted">{historyDay(e.done_at)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {care && (
          <section id="care" className="mt-10 scroll-mt-20">
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
      </div>

      <PlantActions
        plantId={plant.id}
        nickname={plant.nickname}
        potCm={Number(plant.pot_diameter_cm)}
        checkinDue={checkinDue}
        waterDue={!!(waterTask && waterDueToday)}
        rescue={rescue ? "open" : "start"}
        picture={{
          homeId: plant.home_id,
          speciesName: plant.species_name,
          photos: picturePhotos
            .map((p) => ({ id: p.id, url: urlById.get(p.id) ? pictureUrl(urlById.get(p.id)!, p.kind) : "", kind: p.kind }))
            .filter((p) => p.url)
            .reverse(),
          currentId: plant.cover_photo_id,
          pinned: plant.cover_pinned,
          canCutOut: cutoutConfigured() && (CUTTABLE_KINDS as readonly string[]).includes(cover?.kind ?? ""),
        }}
      />
    </main>
  );
}
