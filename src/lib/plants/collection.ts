// The Plants tab: what each card says (health word, trend, next action) and how the grid is sorted.

import { daysAhead } from "../care/today";

export type Trend = "up" | "down" | "steady";
export type SortMode = "attention" | "name" | "newest";

export const SORT_LABELS: Record<SortMode, string> = { attention: "Needs attention", name: "A–Z", newest: "Newest" };

/** Show the search box once the collection is bigger than this. */
export const SEARCH_FROM = 6;

/** A change smaller than this between two checks counts as steady. */
const TREND_STEP = 5;

export type NextAction = { icon: string; text: string; urgent: boolean };

export type PlantCard = {
  id: string;
  nickname: string;
  species: string | null;
  photoUrl: string | null;
  createdAt: string;
  er: boolean;
  health: number | null;
  trend: Trend | null;
  /** Local days until the next watering: 0 today, negative when overdue, null when none is planned. */
  waterIn: number | null;
  checkinDue: boolean;
  next: NextAction | null;
};

/** Latest health against the check before it. */
export function healthTrend(latest: number | null, previous: number | null): Trend | null {
  if (latest == null || previous == null) return null;
  const diff = latest - previous;
  return diff >= TREND_STEP ? "up" : diff <= -TREND_STEP ? "down" : "steady";
}

/** "Tomorrow", "Tue" within a week, "14 Oct" after that. */
export function shortDay(timeZone: string, now: Date, date: Date): string {
  const n = daysAhead(timeZone, now, date);
  if (n === 1) return "Tomorrow";
  const opts: Intl.DateTimeFormatOptions = n < 7 ? { weekday: "short" } : { day: "numeric", month: "short" };
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, ...opts }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(date);
  }
}

/** The one thing a card points to: a rescue, watering that's due, a check-in, or the next watering. */
export function nextAction(
  p: { er: boolean; waterIn: number | null; waterDue: string | null; checkinDue: boolean },
  timeZone: string,
  now: Date,
): NextAction | null {
  if (p.er) return { icon: "🚨", text: "Needs help", urgent: true };
  if (p.waterIn != null && p.waterIn <= 0) return { icon: "💧", text: p.waterIn < 0 ? "Water overdue" : "Water today", urgent: true };
  if (p.checkinDue) return { icon: "📸", text: "Check-in due", urgent: false };
  if (p.waterDue) return { icon: "💧", text: `Water ${shortDay(timeZone, now, new Date(p.waterDue)).replace("Tomorrow", "tomorrow")}`, urgent: false };
  return null;
}

/** Lower comes first: rescues, watering due, poor health, check-ins, then everything else. */
function attentionRank(p: PlantCard): number {
  if (p.er) return 0;
  if (p.waterIn != null && p.waterIn <= 0) return 1;
  if (p.health != null && p.health < 45) return 2;
  if (p.health != null && p.health < 70) return 3;
  if (p.checkinDue) return 4;
  return 5;
}

const byName = (a: PlantCard, b: PlantCard) => a.nickname.localeCompare(b.nickname, "en", { sensitivity: "base" });

export function sortPlants(plants: PlantCard[], mode: SortMode): PlantCard[] {
  const list = [...plants];
  if (mode === "name") return list.sort(byName);
  if (mode === "newest") return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byName(a, b));
  const water = (p: PlantCard) => p.waterIn ?? Number.POSITIVE_INFINITY;
  return list.sort((a, b) => attentionRank(a) - attentionRank(b) || water(a) - water(b) || byName(a, b));
}

/** Case- and accent-insensitive match on the name or species. */
export function matchesSearch(p: Pick<PlantCard, "nickname" | "species">, query: string): boolean {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const q = fold(query.trim());
  return !q || fold(p.nickname).includes(q) || (p.species != null && fold(p.species).includes(q));
}
