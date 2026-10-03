import "server-only";
import { assessmentSchema } from "@/lib/ai/schemas";
import { createAdminClient } from "@/lib/supabase/server";
import { feedingSeason } from "./plan";
import { evaluateRepot } from "./repot";
import type { Hemisphere } from "./watering";

const DEFAULT_REPOT_INTERVAL_MONTHS = 24;
const toDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface RepotDetails {
  urgency: "now" | "soon" | "later";
  reasons: string[];
  recommendedPotCm: number;
}

/**
 * Recomputes a plant's long-term milestones (repot window, feeding season) from its
 * latest check. Called after every assessment and after a repot. Server-only writes.
 */
export async function refreshPlantPlan(plantId: string, hemisphere: Hemisphere, now = new Date()) {
  const admin = createAdminClient();
  const [{ data: plant }, { data: latest }, { data: existing }] = await Promise.all([
    admin
      .from("plants")
      .select("pot_diameter_cm, last_repotted_at, created_at, species:species_profiles(repot_interval_months)")
      .eq("id", plantId)
      .maybeSingle(),
    admin
      .from("assessments")
      .select("raw")
      .eq("plant_id", plantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("milestones").select("type, target_date, notified_at").eq("plant_id", plantId),
  ]);
  if (!plant) return;

  const assessment = latest ? assessmentSchema.safeParse(latest.raw).data : undefined;
  const species = Array.isArray(plant.species) ? plant.species[0] : plant.species;
  const repot = evaluateRepot({
    now,
    hemisphere,
    potDiameterCm: Number(plant.pot_diameter_cm),
    heightCm: assessment?.estimatedHeightCm ?? null,
    rootsVisible: assessment?.repotSignals.rootsVisible,
    drainsTooFast: assessment?.repotSignals.drainsTooFast,
    lastRepottedAt: plant.last_repotted_at ? new Date(plant.last_repotted_at) : null,
    trackingSince: new Date(plant.created_at),
    repotIntervalMonths: species?.repot_interval_months ?? DEFAULT_REPOT_INTERVAL_MONTHS,
  });

  // Keep the "already told you" mark unless the window moved by more than a month.
  const prevRepot = existing?.find((m) => m.type === "repot");
  const moved =
    !prevRepot ||
    Math.abs(new Date(prevRepot.target_date).getTime() - repot.suggestedDate.getTime()) > 31 * 86_400_000;

  const season = feedingSeason(now, hemisphere);
  const details: RepotDetails = {
    urgency: repot.urgency,
    reasons: repot.reasons,
    recommendedPotCm: repot.recommendedPotCm,
  };
  const { error } = await admin.from("milestones").upsert(
    [
      {
        plant_id: plantId,
        type: "repot",
        target_date: toDate(repot.suggestedDate),
        details,
        done_at: null,
        notified_at: moved ? null : prevRepot?.notified_at,
      },
      {
        plant_id: plantId,
        type: "fertilize_season",
        target_date: toDate(season.start),
        details: { start: toDate(season.start), end: toDate(season.end), active: season.active },
        done_at: null,
      },
    ],
    { onConflict: "plant_id,type" },
  );
  if (error) throw error;
}
