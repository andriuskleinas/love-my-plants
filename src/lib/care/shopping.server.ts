import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { RepotDetails } from "./plan.server";
import { itemKey, shoppingSuggestions, type Suggestion } from "./shopping";

export interface ShoppingItem {
  id: string;
  item: string;
  reason: string | null;
  status: "open" | "bought" | "dismissed";
  plantNickname: string | null;
}

/** The home whose list a user shops for: their own, else one they help with. */
export async function shoppingHomeFor(userId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("home_members")
    .select("home_id, role")
    .eq("user_id", userId)
    .in("role", ["owner", "household"])
    .order("role");
  return data?.[0]?.home_id ?? null;
}

/** Open items, things bought in the last 2 weeks, and fresh suggestions from the plan. */
export async function loadShopping(homeId: string, now = new Date()) {
  const admin = createAdminClient();
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const [{ data: items }, { data: plants }] = await Promise.all([
    admin
      .from("shopping_items")
      .select("id, item, reason, status, bought_at, plant:plants(nickname)")
      .eq("home_id", homeId)
      .or(`status.eq.open,bought_at.gte.${since}`)
      .order("created_at"),
    admin
      .from("plants")
      .select("id, nickname, species:species_profiles(soil_mix), milestones(type, target_date, details)")
      .eq("home_id", homeId)
      .neq("status", "archived"),
  ]);

  const list: ShoppingItem[] = (items ?? [])
    .filter((i) => i.status !== "dismissed")
    .map((i) => ({
      id: i.id,
      item: i.item,
      reason: i.reason,
      status: i.status as ShoppingItem["status"],
      plantNickname: (Array.isArray(i.plant) ? i.plant[0] : i.plant)?.nickname ?? null,
    }));

  const feedingRow = plants?.flatMap((p) => p.milestones ?? []).find((m) => m.type === "fertilize_season");
  const feeding = feedingRow
    ? { start: new Date((feedingRow.details as { start: string }).start), active: !!(feedingRow.details as { active: boolean }).active }
    : { start: new Date(now.getTime() + 365 * 86_400_000), active: false };
  const suggestions: Suggestion[] = shoppingSuggestions({
    now,
    feeding,
    existing: (items ?? []).map((i) => i.item),
    plants: (plants ?? []).map((p) => {
      const repot = (p.milestones ?? []).find((m) => m.type === "repot");
      const d = repot?.details as RepotDetails | undefined;
      const species = Array.isArray(p.species) ? p.species[0] : p.species;
      return {
        id: p.id,
        nickname: p.nickname,
        soilMix: species?.soil_mix ?? null,
        repot: repot && d ? { targetDate: new Date(repot.target_date), urgency: d.urgency, recommendedPotCm: d.recommendedPotCm } : null,
      };
    }),
  });
  return { items: list, suggestions };
}

/** Adds items not already open on the list. Returns how many were added. */
export async function addShoppingItems(
  homeId: string,
  items: { item: string; reason?: string | null; plantId?: string | null }[],
  source: "manual" | "chat" | "plan",
): Promise<number> {
  const admin = createAdminClient();
  const { data: open } = await admin.from("shopping_items").select("item").eq("home_id", homeId).eq("status", "open");
  const have = new Set((open ?? []).map((i) => itemKey(i.item)));
  const fresh = items.filter((i) => i.item.trim() && !have.has(itemKey(i.item)));
  if (!fresh.length) return 0;
  const { error } = await admin.from("shopping_items").insert(
    fresh.map((i) => ({ home_id: homeId, item: i.item.trim().slice(0, 120), reason: i.reason ?? null, plant_id: i.plantId ?? null, source })),
  );
  if (error) throw error;
  return fresh.length;
}

export async function setItemStatus(homeId: string, itemId: string, status: "open" | "bought" | "dismissed") {
  const { data, error } = await createAdminClient()
    .from("shopping_items")
    .update({ status, bought_at: status === "bought" ? new Date().toISOString() : null })
    .eq("id", itemId)
    .eq("home_id", homeId)
    .select("item")
    .maybeSingle();
  if (error) throw error;
  return data?.item ?? null;
}
