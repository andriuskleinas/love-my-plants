// Watering interval engine (plan F4).
// interval = species_base × season × pot × light × learned, clamped to a sane range.

export type PotMaterial = "plastic" | "ceramic" | "terracotta" | "other";
export type WindowDirection = "N" | "E" | "S" | "W" | "none";
export type Hemisphere = "north" | "south";
export type SoilFeedback = "dry" | "damp" | "dry_drooping";

export interface WateringInput {
  baseIntervalDays: number;
  date: Date;
  hemisphere?: Hemisphere;
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

export function seasonFactor(date: Date, hemisphere: Hemisphere = "north"): number {
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
    seasonFactor(input.date, input.hemisphere) *
    potFactor(input.potDiameterCm, input.potMaterial, input.hasDrainage) *
    lightFactor(input.windowDirection, input.hemisphere) *
    (input.learnedFactor ?? 1);
  return clamp(Math.round(raw), MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS);
}

export function nextWaterAt(lastWateredAt: Date, intervalDays: number): Date {
  return new Date(lastWateredAt.getTime() + intervalDays * DAY_MS);
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

/**
 * First watering reminder for a newly registered plant, when we don't know when it was
 * last watered: thirsty-looking plants are due today, others part-way through an interval.
 */
export function initialWaterDueAt(hydrationScore: number, intervalDays: number, now: Date): Date {
  if (hydrationScore < 45) return now;
  const fraction = hydrationScore < 70 ? 0.5 : 1;
  return new Date(now.getTime() + Math.max(1, Math.round(intervalDays * fraction)) * DAY_MS);
}

/** Rough watering amount: ~1/4 of the pot volume, rounded to 50 ml. */
export function waterAmountMl(potDiameterCm: number): number {
  const r = potDiameterCm / 2;
  const volumeMl = Math.PI * r * r * potDiameterCm * 0.9; // pot height ≈ diameter
  return Math.max(50, Math.round((volumeMl * 0.25) / 50) * 50);
}
