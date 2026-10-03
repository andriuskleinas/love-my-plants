// Shopping suggestions from each plant's plan (plan F10).

const DAY_MS = 24 * 60 * 60 * 1000;
export const REPOT_SHOPPING_DAYS = 45;
export const FEEDING_SHOPPING_DAYS = 30;

export interface ShoppingPlant {
  id: string;
  nickname: string;
  soilMix: string | null;
  repot?: { targetDate: Date; urgency: "now" | "soon" | "later"; recommendedPotCm: number } | null;
}

export interface Suggestion {
  key: string;
  item: string;
  reason: string;
  plantId: string | null;
}

export const itemKey = (item: string) => item.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * What to buy soon: a pot and soil for upcoming repots, and fertilizer before the
 * feeding season. Items already on the list (by name) are left out.
 */
export function shoppingSuggestions(opts: {
  plants: ShoppingPlant[];
  feeding: { start: Date; active: boolean };
  now: Date;
  existing: string[];
}): Suggestion[] {
  const have = new Set(opts.existing.map(itemKey));
  const out = new Map<string, Suggestion>();
  const add = (s: Omit<Suggestion, "key">) => {
    const key = itemKey(s.item);
    if (have.has(key)) return;
    const prev = out.get(key);
    // Same item for several plants: one line, all names in the reason.
    out.set(key, prev ? { ...prev, plantId: null, reason: `${prev.reason}, ${s.reason.replace(/^For repotting /, "")}` } : { key, ...s });
  };

  for (const p of opts.plants) {
    const r = p.repot;
    if (!r) continue;
    const soon = r.urgency !== "later" || r.targetDate.getTime() - opts.now.getTime() <= REPOT_SHOPPING_DAYS * DAY_MS;
    if (!soon) continue;
    add({ item: `${r.recommendedPotCm} cm pot with a drainage hole`, reason: `For repotting ${p.nickname}`, plantId: p.id });
    if (p.soilMix) add({ item: p.soilMix, reason: `For repotting ${p.nickname}`, plantId: p.id });
  }

  const feedingSoon = opts.feeding.active || opts.feeding.start.getTime() - opts.now.getTime() <= FEEDING_SHOPPING_DAYS * DAY_MS;
  if (feedingSoon && opts.plants.length) {
    add({
      item: "Liquid houseplant fertilizer",
      reason: opts.feeding.active ? "Feeding season is on" : "Feeding season starts soon",
      plantId: null,
    });
  }
  return [...out.values()];
}
