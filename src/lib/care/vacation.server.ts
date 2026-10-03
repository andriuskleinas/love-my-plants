import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tripDays, vacationPrep, vacationStatus, type PrepItem } from "./vacation";
import type { Hemisphere, WindowDirection, PotMaterial } from "./watering";

export interface TripView {
  id: string;
  startsAt: string;
  endsAt: string;
  days: number;
  status: ReturnType<typeof vacationStatus>;
  sitters: { name: string; plants: number }[];
  items: (PrepItem & { done: boolean })[];
}

/** The user's next or current trip with its live prep checklist (recomputed from today's plants). */
export async function loadTrip(supabase: SupabaseClient, userId: string, now = new Date()): Promise<TripView | null> {
  const { data: trip } = await supabase
    .from("vacations")
    .select("id, home_id, starts_at, ends_at, prep_checklist")
    .eq("created_by", userId)
    .gte("ends_at", now.toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  if (!trip) return null;

  const [{ data: plants }, { data: tasks }, { data: rescues }, { data: sitters }, { data: profile }] = await Promise.all([
    supabase.from("plants").select("id, nickname, window_direction, pot_material").eq("home_id", trip.home_id).neq("status", "archived"),
    supabase.from("care_tasks").select("plant_id, interval_days").eq("type", "water").in("status", ["pending", "snoozed"]),
    supabase.from("rescue_plans").select("plant_id").is("ended_at", null),
    // Sitters whose dates overlap the trip.
    supabase
      .from("home_members")
      .select("display_name, plant_scope")
      .eq("home_id", trip.home_id)
      .eq("role", "sitter")
      .lte("starts_at", trip.ends_at)
      .gte("ends_at", trip.starts_at),
    supabase.from("profiles").select("hemisphere").eq("id", userId).maybeSingle(),
  ]);

  const covered = new Set((sitters ?? []).flatMap((s) => s.plant_scope ?? []));
  const startsAt = new Date(trip.starts_at);
  const endsAt = new Date(trip.ends_at);
  const toPlant = (p: NonNullable<typeof plants>[number]) => ({
    id: p.id,
    nickname: p.nickname,
    intervalDays: Number(tasks?.find((t) => t.plant_id === p.id)?.interval_days ?? 7),
    windowDirection: p.window_direction as WindowDirection,
    potMaterial: p.pot_material as PotMaterial,
    inRescue: !!rescues?.some((r) => r.plant_id === p.id),
  });
  const hemisphere = (profile?.hemisphere ?? "north") as Hemisphere;
  const uncovered = (plants ?? []).filter((p) => !covered.has(p.id)).map(toPlant);
  const coveredPlants = (plants ?? []).filter((p) => covered.has(p.id)).map(toPlant);

  // Plants a sitter covers get the sitter items; the rest get self-care prep.
  const items = [
    ...(coveredPlants.length ? vacationPrep({ plants: coveredPlants, startsAt, endsAt, hasSitter: true, hemisphere }) : []),
    ...vacationPrep({ plants: uncovered, startsAt, endsAt, hasSitter: false, hemisphere }),
  ];
  const unique = [...new Map(items.map((i) => [i.key, i])).values()];
  const done = new Set((trip.prep_checklist as { done?: string[] })?.done ?? []);

  return {
    id: trip.id,
    startsAt: trip.starts_at,
    endsAt: trip.ends_at,
    days: tripDays(startsAt, endsAt),
    status: vacationStatus(startsAt, endsAt, now),
    sitters: (sitters ?? []).map((s) => ({ name: s.display_name, plants: s.plant_scope?.length ?? 0 })),
    items: unique.map((i) => ({ ...i, done: done.has(i.key) })),
  };
}
