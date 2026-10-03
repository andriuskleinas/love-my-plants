// Watering interval engine (plan F4).
// interval = species_base × season × pot × light × learned, clamped to a sane range.

export type PotMaterial = "plastic" | "ceramic" | "terracotta" | "other";
export type CardinalDirection = "N" | "E" | "S" | "W";
export type WindowDirection = CardinalDirection | "NE" | "SE" | "SW" | "NW" | "none";
export const WINDOW_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "none"] as const;
export type Hemisphere = "north" | "south";
export type SoilFeedback = "dry" | "damp" | "dry_drooping";

export interface WateringInput {
  baseIntervalDays: number;
  date: Date;
  hemisphere?: Hemisphere;
  /** Home latitude (rounded). When known, seasons follow real daylight hours. */
  latitude?: number | null;
  potDiameterCm: number;
  potMaterial: PotMaterial;
  hasDrainage: boolean;
  windowDirection: WindowDirection;
  learnedFactor?: number;
}

export const MIN_INTERVAL_DAYS = 2;
export const MAX_INTERVAL_DAYS = 45;
export const DAMP_SNOOZE_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function hemisphereOf(latitude: number): Hemisphere {
  return latitude < 0 ? "south" : "north";
}

/** Hours between sunrise and sunset at a latitude on a date (standard declination formula). */
export function daylightHours(latitude: number, date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / DAY_MS);
  const rad = Math.PI / 180;
  const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const x = -Math.tan(latitude * rad) * Math.tan(declination * rad);
  if (x <= -1) return 24; // midnight sun
  if (x >= 1) return 0; // polar night
  return (2 * Math.acos(x)) / rad / 15;
}

export function seasonFactor(date: Date, hemisphere: Hemisphere = "north", latitude?: number | null): number {
  // With a location: less daylight means slower growth and slower drying, and vice versa.
  // 12 h of daylight is neutral; ~7 h (a northern European winter) waters ~45% less often.
  if (latitude != null) {
    return clamp(Math.pow(12 / Math.max(daylightHours(latitude, date), 1), 0.7), 0.8, 1.6);
  }
  // Shift month by 6 for the southern hemisphere so "summer" is always Jun–Aug equivalent.
  const month = (date.getMonth() + (hemisphere === "south" ? 6 : 0)) % 12;
  if (month >= 5 && month <= 7) return 0.85; // summer: dries faster
  if (month === 11 || month <= 1) return 1.4; // winter: slower, often dormant
  return 1.0; // spring / autumn
}

export function potFactor(diameterCm: number, material: PotMaterial, hasDrainage: boolean): number {
  // Bigger pots hold more water relative to evaporation surface; 15 cm is the reference pot.
  const size = clamp(Math.pow(Math.max(diameterCm, 5) / 15, 0.3), 0.7, 1.4);
  const mat = material === "terracotta" ? 0.85 : material === "ceramic" ? 1.05 : 1.0;
  const drain = hasDrainage ? 1.0 : 1.2;
  return size * mat * drain;
}

export function lightFactor(direction: WindowDirection, hemisphere: Hemisphere = "north"): number {
  // In-between windows (e.g. SW) sit halfway between their two sides.
  if (direction.length === 2) {
    const [a, b] = direction.split("") as CardinalDirection[];
    return (lightFactor(a, hemisphere) + lightFactor(b, hemisphere)) / 2;
  }
  // The equator-facing window gets the most sun.
  const sunny = hemisphere === "north" ? "S" : "N";
  const shady = hemisphere === "north" ? "N" : "S";
  if (direction === sunny) return 0.85;
  if (direction === "W") return 0.9;
  if (direction === "E") return 1.0;
  if (direction === shady) return 1.15;
  return 1.3; // no window
}

export function wateringIntervalDays(input: WateringInput): number {
  const raw =
    input.baseIntervalDays *
    seasonFactor(input.date, input.hemisphere, input.latitude) *
    potFactor(input.potDiameterCm, input.potMaterial, input.hasDrainage) *
    lightFactor(input.windowDirection, input.hemisphere) *
    (input.learnedFactor ?? 1);
  return clamp(Math.round(raw), MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS);
}

export function nextWaterAt(lastWateredAt: Date, intervalDays: number): Date {
  return new Date(lastWateredAt.getTime() + intervalDays * DAY_MS);
}

const COMPASS: CardinalDirection[] = ["N", "E", "S", "W"];

/**
 * Combines the sides a user tapped into one window direction:
 * none → "none", one side → that side, two neighbouring sides → "SW"-style.
 * Opposite sides (N+S) aren't one window, so the last tap wins.
 */
export function combineWindowSides(sides: CardinalDirection[]): WindowDirection {
  if (sides.length === 0) return "none";
  if (sides.length === 1) return sides[0];
  const [a, b] = sides.slice(-2);
  if ((COMPASS.indexOf(a) + 2) % 4 === COMPASS.indexOf(b)) return b;
  const ns = [a, b].find((d) => d === "N" || d === "S")!;
  const ew = [a, b].find((d) => d === "E" || d === "W")!;
  return `${ns}${ew}` as WindowDirection;
}

const DIRECTION_NAMES: Record<string, string> = { N: "north", E: "east", S: "south", W: "west" };

/** "SW" → "south-west" */
export function windowDirectionName(direction: WindowDirection): string {
  if (direction === "none") return "no window";
  return direction.split("").map((d) => DIRECTION_NAMES[d]).join("-");
}

export interface FeedbackResult {
  learnedFactor: number;
  /** When set, the reminder is postponed to this time instead of being completed. */
  snoozeUntil?: Date;
}

/** Learning loop: the user's answer to "is the top 2–3 cm of soil dry?". */
export function applySoilFeedback(
  learnedFactor: number,
  feedback: SoilFeedback,
  now: Date,
): FeedbackResult {
  switch (feedback) {
    case "damp":
      return {
        learnedFactor: clamp(learnedFactor * 1.15, 0.5, 2),
        snoozeUntil: new Date(now.getTime() + DAMP_SNOOZE_DAYS * DAY_MS),
      };
    case "dry_drooping":
      return { learnedFactor: clamp(learnedFactor * 0.85, 0.5, 2) };
    case "dry":
      return { learnedFactor };
  }
}

export type WaterOutcome = SoilFeedback | "snooze";

export interface WaterPlan {
  watered: boolean;
  learnedFactor: number;
  intervalDays: number;
  nextDueAt: Date;
}

/**
 * What happens when the owner answers a watering reminder:
 * - dry: they water now; next reminder one interval away.
 * - dry_drooping: they water now, and future intervals get shorter.
 * - damp: no water; check again in 2 days, and future intervals get longer.
 * - snooze: no water, no learning; ask again tomorrow.
 */
export function planAfterWaterReminder(
  outcome: WaterOutcome,
  input: Omit<WateringInput, "learnedFactor"> & { learnedFactor: number },
): WaterPlan {
  const now = input.date;
  if (outcome === "snooze") {
    return {
      watered: false,
      learnedFactor: input.learnedFactor,
      intervalDays: wateringIntervalDays(input),
      nextDueAt: new Date(now.getTime() + DAY_MS),
    };
  }
  const feedback = applySoilFeedback(input.learnedFactor, outcome, now);
  const intervalDays = wateringIntervalDays({ ...input, learnedFactor: feedback.learnedFactor });
  return {
    watered: outcome !== "damp",
    learnedFactor: feedback.learnedFactor,
    intervalDays,
    nextDueAt: feedback.snoozeUntil ?? nextWaterAt(now, intervalDays),
  };
}

/**
 * First watering reminder for a newly registered plant, when we don't know when it was
 * last watered: thirsty-looking plants are due today, others part-way through an interval.
 */
export function initialWaterDueAt(hydrationScore: number, intervalDays: number, now: Date): Date {
  if (hydrationScore < 45) return now;
  const fraction = hydrationScore < 70 ? 0.5 : 1;
  return new Date(now.getTime() + Math.max(1, Math.round(intervalDays * fraction)) * DAY_MS);
}

/** Rough watering amount: ~12% of the pot volume (≈150 ml for a 12 cm pot), rounded to 50 ml. */
export function waterAmountMl(potDiameterCm: number): number {
  const r = potDiameterCm / 2;
  const volumeMl = Math.PI * r * r * potDiameterCm * 0.9; // pot height ≈ diameter
  return Math.max(50, Math.round((volumeMl * 0.12) / 50) * 50);
}
