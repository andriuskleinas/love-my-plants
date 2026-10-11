import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/plants/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  planAfterLoggedWatering,
  planAfterWaterReminder,
  type Hemisphere,
  type LoggedSoil,
  type WaterOutcome,
  type WaterPlan,
} from "./watering";

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
  /** For plant-sitters without an account: their membership, and whose settings to use. */
  sitter?: { memberId: string },
) {
  const { data: task } = await supabase
    .from("care_tasks")
    .select(
      "id, type, plant:plants(id, home_id, species_id, pot_diameter_cm, pot_material, has_drainage, window_direction, water_learned_factor)",
    )
    .eq("id", taskId)
    .maybeSingle();
  const plant = (Array.isArray(task?.plant) ? task.plant[0] : task?.plant) as PlantForWatering | undefined;
  if (!task || task.type !== "water" || !plant) throw new HttpError(404, "This reminder was already answered. Refresh to see the current one.");

  const [input, memberId] = await Promise.all([
    wateringInputFor(supabase, userId, plant, now),
    sitter ? Promise.resolve(sitter.memberId) : memberIdFor(supabase, userId, plant.home_id),
  ]);
  const plan = planAfterWaterReminder(outcome, input);

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

  await saveWaterPlan(supabase, plant.id, task.id, plan, now);
  return { watered: plan.watered, nextDueAt: plan.nextDueAt.toISOString(), intervalDays: plan.intervalDays };
}

/** The plant's watering settings plus the owner's season and location. */
async function wateringInputFor(supabase: SupabaseClient, userId: string, plant: PlantForWatering, date: Date) {
  const [{ data: species }, { data: profile }] = await Promise.all([
    plant.species_id
      ? supabase.from("species_profiles").select("base_water_interval_days").eq("id", plant.species_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profiles").select("hemisphere, latitude").eq("id", userId).maybeSingle(),
  ]);
  return {
    baseIntervalDays: Number(species?.base_water_interval_days ?? DEFAULT_BASE_INTERVAL_DAYS),
    date,
    hemisphere: (profile?.hemisphere ?? "north") as Hemisphere,
    latitude: profile?.latitude == null ? null : Number(profile.latitude),
    potDiameterCm: Number(plant.pot_diameter_cm),
    potMaterial: plant.pot_material,
    hasDrainage: plant.has_drainage,
    windowDirection: plant.window_direction,
    learnedFactor: Number(plant.water_learned_factor),
  };
}

/** Moves the watering reminder and stores what we learned about the plant. */
async function saveWaterPlan(supabase: SupabaseClient, plantId: string, taskId: string | null, plan: WaterPlan, wateredAt: Date) {
  if (taskId) {
    const { error: taskError } = await supabase
      .from("care_tasks")
      .update({
        due_at: plan.nextDueAt.toISOString(),
        interval_days: plan.intervalDays,
        status: "pending",
        last_notified_at: null,
      })
      .eq("id", taskId);
    if (taskError) throw taskError;
  }

  // Learned factor and last-watered are plant fields only managers may edit; the
  // caller already checked access through RLS, so write them server-side.
  const plantUpdate: Record<string, unknown> = { water_learned_factor: plan.learnedFactor };
  if (plan.watered) plantUpdate.last_watered_at = wateredAt.toISOString();
  const { error: plantError } = await createAdminClient().from("plants").update(plantUpdate).eq("id", plantId);
  if (plantError) throw plantError;
}

const DAY_MS = 86_400_000;

/**
 * A watering the owner logs on their own, e.g. the soil was dry before the reminder.
 * Restarts the watering cycle from that moment and learns when it came early.
 */
export async function logWatering(
  supabase: SupabaseClient,
  userId: string,
  plantId: string,
  soil: LoggedSoil,
  wateredAt: Date,
  note: string | null,
) {
  const [{ data: plant }, { data: task }] = await Promise.all([
    supabase
      .from("plants")
      .select("id, home_id, species_id, pot_diameter_cm, pot_material, has_drainage, window_direction, water_learned_factor, last_watered_at")
      .eq("id", plantId)
      .maybeSingle(),
    supabase
      .from("care_tasks")
      .select("id, due_at, interval_days")
      .eq("plant_id", plantId)
      .eq("type", "water")
      .in("status", ["pending", "snoozed"])
      .order("due_at")
      .limit(1)
      .maybeSingle(),
  ]);
  if (!plant) throw new HttpError(404, "This plant no longer exists. Go back to your plants.");

  const memberId = await memberIdFor(supabase, userId, plant.home_id);
  const { error } = await supabase.from("care_events").insert({
    plant_id: plant.id,
    type: "water",
    done_by_member: memberId,
    soil_feedback: soil === "unknown" ? null : soil,
    note,
    done_at: wateredAt.toISOString(),
  });
  if (error) throw error;

  // An older watering than the one we know about only goes into the history.
  const lastWatered = plant.last_watered_at ? new Date(plant.last_watered_at) : null;
  if (lastWatered && wateredAt <= lastWatered) {
    return { nextDueAt: task?.due_at ?? null, learned: false };
  }

  // The cycle started at the last watering; for new plants, one interval before the reminder.
  const dueAt = task ? new Date(task.due_at) : null;
  const startedAt =
    lastWatered ?? (dueAt && task?.interval_days ? new Date(dueAt.getTime() - Number(task.interval_days) * DAY_MS) : null);
  const input = await wateringInputFor(supabase, userId, plant as PlantForWatering, wateredAt);
  const plan = planAfterLoggedWatering(soil, input, startedAt && dueAt ? { startedAt, dueAt } : null);
  await saveWaterPlan(supabase, plant.id, task?.id ?? null, plan, wateredAt);

  return { nextDueAt: plan.nextDueAt.toISOString(), learned: plan.learnedFactor < input.learnedFactor };
}
