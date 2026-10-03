import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/plants/server";
import { createAdminClient } from "@/lib/supabase/server";
import { planAfterWaterReminder, type Hemisphere, type WaterOutcome } from "./watering";

const DEFAULT_BASE_INTERVAL_DAYS = 7;

type PlantForWatering = {
  id: string;
  home_id: string;
  species_id: string | null;
  pot_diameter_cm: number;
  pot_material: "plastic" | "ceramic" | "terracotta" | "other";
  has_drainage: boolean;
  window_direction: Parameters<typeof planAfterWaterReminder>[1]["windowDirection"];
  water_learned_factor: number;
};

/** The signed-in user's Care Circle membership id in a home (for "who watered"). */
export async function memberIdFor(supabase: SupabaseClient, userId: string, homeId: string) {
  const { data } = await supabase
    .from("home_members")
    .select("id")
    .eq("home_id", homeId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Applies the owner's answer to a watering reminder: logs the watering, moves the
 * reminder, and updates the plant's learned watering factor.
 * Reads go through the user's client, so RLS decides who may answer (sitters included).
 */
export async function answerWaterTask(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
  outcome: WaterOutcome,
  now = new Date(),
) {
  const { data: task } = await supabase
    .from("care_tasks")
    .select(
      "id, type, plant:plants(id, home_id, species_id, pot_diameter_cm, pot_material, has_drainage, window_direction, water_learned_factor)",
    )
    .eq("id", taskId)
    .maybeSingle();
  const plant = (Array.isArray(task?.plant) ? task.plant[0] : task?.plant) as PlantForWatering | undefined;
  if (!task || task.type !== "water" || !plant) throw new HttpError(404, "Reminder not found.");

  const [{ data: species }, { data: profile }, memberId] = await Promise.all([
    plant.species_id
      ? supabase.from("species_profiles").select("base_water_interval_days").eq("id", plant.species_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profiles").select("hemisphere, latitude").eq("id", userId).maybeSingle(),
    memberIdFor(supabase, userId, plant.home_id),
  ]);

  const plan = planAfterWaterReminder(outcome, {
    baseIntervalDays: Number(species?.base_water_interval_days ?? DEFAULT_BASE_INTERVAL_DAYS),
    date: now,
    hemisphere: (profile?.hemisphere ?? "north") as Hemisphere,
    latitude: profile?.latitude == null ? null : Number(profile.latitude),
    potDiameterCm: Number(plant.pot_diameter_cm),
    potMaterial: plant.pot_material,
    hasDrainage: plant.has_drainage,
    windowDirection: plant.window_direction,
    learnedFactor: Number(plant.water_learned_factor),
  });

  if (plan.watered) {
    const { error } = await supabase.from("care_events").insert({
      plant_id: plant.id,
      task_id: task.id,
      type: "water",
      done_by_member: memberId,
      soil_feedback: outcome,
      done_at: now.toISOString(),
    });
    if (error) throw error;
  }

  const { error: taskError } = await supabase
    .from("care_tasks")
    .update({
      due_at: plan.nextDueAt.toISOString(),
      interval_days: plan.intervalDays,
      status: "pending",
      last_notified_at: null,
    })
    .eq("id", task.id);
  if (taskError) throw taskError;

  // Learned factor and last-watered are plant fields only managers may edit; the
  // answer above was already authorized, so write them server-side.
  const plantUpdate: Record<string, unknown> = { water_learned_factor: plan.learnedFactor };
  if (plan.watered) plantUpdate.last_watered_at = now.toISOString();
  const { error: plantError } = await createAdminClient().from("plants").update(plantUpdate).eq("id", plant.id);
  if (plantError) throw plantError;

  return { watered: plan.watered, nextDueAt: plan.nextDueAt.toISOString(), intervalDays: plan.intervalDays };
}
