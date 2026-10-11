import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { HttpError } from "@/lib/plants/server";
import { createAdminClient } from "@/lib/supabase/server";
import { userCanAccessPlant } from "./digest.server";
import { CARE_LABELS, type LogType } from "./log";
import { refreshPlantPlan } from "./plan.server";
import { logWatering, memberIdFor, type UndoState } from "./tasks.server";
import type { Hemisphere, LoggedSoil } from "./watering";

export interface CareLogInput {
  type: LogType;
  doneAt: Date;
  /** Watering only: how the soil was before. */
  soil?: LoggedSoil;
  note?: string | null;
  /** Repotting only: the new pot's width, when known. */
  potCm?: number | null;
}

export interface CareLogResult {
  eventId: string;
  /** Watering: when the next reminder is due now. */
  nextDueAt?: string | null;
  /** Watering: we'll water more often from now on. */
  learned?: boolean;
}

/**
 * Records care the owner did on their own (from the app or the chat), and lets the plan follow.
 * Pass the user's client from the app so RLS applies; the bot passes the service client after
 * checking access itself.
 */
export async function logCare(supabase: SupabaseClient, userId: string, plantId: string, input: CareLogInput): Promise<CareLogResult> {
  if (input.type === "water") {
    return logWatering(supabase, userId, plantId, input.soil ?? "unknown", input.doneAt, input.note ?? null);
  }
  if (input.type === "repot") return logRepot(supabase, userId, plantId, input.potCm ?? null, input.doneAt, input.note ?? null);

  const { data: plant } = await supabase.from("plants").select("home_id").eq("id", plantId).maybeSingle();
  if (!plant) throw new HttpError(404, "This plant no longer exists. Go back to your plants.");
  const { data: event, error } = await supabase
    .from("care_events")
    .insert({
      plant_id: plantId,
      type: input.type,
      note: input.note || null,
      done_at: input.doneAt.toISOString(),
      done_by_member: await memberIdFor(supabase, userId, plant.home_id),
    })
    .select("id")
    .single();
  if (error) throw error;
  return { eventId: event.id };
}

/** "I repotted it": new pot size (if given), repot date, and a fresh plan. */
export async function logRepot(
  supabase: SupabaseClient,
  userId: string,
  plantId: string,
  potCm: number | null,
  doneAt: Date,
  note: string | null = null,
): Promise<CareLogResult> {
  const { data: before } = await supabase
    .from("plants")
    .select("home_id, pot_diameter_cm, last_repotted_at")
    .eq("id", plantId)
    .maybeSingle();
  if (!before) throw new HttpError(404, "This plant no longer exists. Go back to your plants.");

  const update: Record<string, unknown> = { last_repotted_at: doneAt.toISOString() };
  if (potCm) update.pot_diameter_cm = potCm;
  const { data: plant, error } = await supabase.from("plants").update(update).eq("id", plantId).select("id").maybeSingle();
  if (error) throw error;
  if (!plant) throw new HttpError(403, "You can't change this plant. Ask a household member to do it.");

  const undoState: UndoState = {
    plant: { pot_diameter_cm: Number(before.pot_diameter_cm), last_repotted_at: before.last_repotted_at },
  };
  const { data: event, error: eventError } = await supabase
    .from("care_events")
    .insert({
      plant_id: plantId,
      type: "repot",
      note: note || (potCm ? `Repotted into a ${potCm} cm pot` : null),
      done_at: doneAt.toISOString(),
      done_by_member: await memberIdFor(supabase, userId, before.home_id),
      undo_state: undoState,
    })
    .select("id")
    .single();
  if (eventError) throw eventError;
  await refreshPlantPlan(plantId, await hemisphereOf(userId));
  return { eventId: event.id };
}

async function hemisphereOf(userId: string): Promise<Hemisphere> {
  const { data } = await createAdminClient().from("profiles").select("hemisphere").eq("id", userId).maybeSingle();
  return (data?.hemisphere ?? "north") as Hemisphere;
}

// Only these fields can be put back, whatever the stored state says.
const undoSchema = z.object({
  plant: z
    .object({
      water_learned_factor: z.number().min(0.5).max(2),
      last_watered_at: z.string().nullable(),
      pot_diameter_cm: z.number().min(4).max(100),
      last_repotted_at: z.string().nullable(),
    })
    .partial()
    .strict(),
  task: z
    .object({ id: z.uuid(), due_at: z.string(), interval_days: z.number().nullable(), status: z.enum(["pending", "snoozed"]) })
    .nullish(),
});

/**
 * Undo for care logged from the chat: deletes the entry and, for a watering or repot,
 * puts the schedule back the way it was. Only the latest entry of its kind can be undone,
 * since a newer one was planned on top of it.
 */
export async function undoLoggedCare(userId: string, eventId: string) {
  const admin = createAdminClient();
  const { data: event } = await admin
    .from("care_events")
    .select("id, plant_id, type, done_at, undo_state, assessment_id, plant:plants(nickname)")
    .eq("id", eventId)
    .maybeSingle();
  if (!event || event.assessment_id || !(await userCanAccessPlant(userId, event.plant_id))) {
    throw new HttpError(404, "This was already undone. Nothing else to do.");
  }
  const nickname = (Array.isArray(event.plant) ? event.plant[0] : event.plant)?.nickname ?? "your plant";
  const { emoji, label } = CARE_LABELS[event.type as LogType] ?? CARE_LABELS.other;

  const state = event.undo_state ? undoSchema.safeParse(event.undo_state) : null;
  if (state && !state.success) throw new HttpError(409, "This can't be undone here. Open the plant in the app to check its plan.");
  if (state?.success) {
    const { count } = await admin
      .from("care_events")
      .select("id", { count: "exact", head: true })
      .eq("plant_id", event.plant_id)
      .eq("type", event.type)
      .gt("done_at", event.done_at);
    if (count) throw new HttpError(409, "A newer one was saved after this, so this can't be undone. Nothing was changed.");

    const { plant, task } = state.data;
    if (Object.keys(plant).length) {
      const { error } = await admin.from("plants").update(plant).eq("id", event.plant_id);
      if (error) throw error;
    }
    if (task) {
      const { error } = await admin
        .from("care_tasks")
        .update({ due_at: task.due_at, interval_days: task.interval_days, status: task.status })
        .eq("id", task.id)
        .eq("plant_id", event.plant_id)
        .eq("type", "water");
      if (error) throw error;
    }
  }

  const { error } = await admin.from("care_events").delete().eq("id", event.id);
  if (error) throw error;
  if (event.type === "repot" && state?.success) await refreshPlantPlan(event.plant_id, await hemisphereOf(userId));
  return { nickname, emoji, label, restored: !!state?.success };
}
