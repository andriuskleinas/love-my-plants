// Plant ER helpers (plan F7).
import { localTime } from "./schedule";

const DAY_MS = 24 * 60 * 60 * 1000;

export const SYMPTOMS = [
  "Yellow leaves",
  "Brown or crispy tips",
  "Drooping or wilting",
  "Black or mushy stem",
  "Spots on leaves",
  "Bugs or webbing",
  "Leaves falling off",
  "White fuzz or mould",
  "Soil smells bad",
] as const;

export type RescueOutcome = "recovered" | "propagated" | "lost";

/** Day 1 is the day the rescue started, counted in the owner's time zone. */
export function rescueDay(startedAt: Date, now: Date, timeZone = "UTC"): number {
  const day = (d: Date) => Date.parse(`${localTime(timeZone, d).date}T00:00:00Z`);
  return Math.max(1, Math.round((day(now) - day(startedAt)) / DAY_MS) + 1);
}

/** Same calendar day in the owner's time zone. */
export function sameLocalDay(a: Date, b: Date, timeZone = "UTC"): boolean {
  return localTime(timeZone, a).date === localTime(timeZone, b).date;
}

export interface RescueStep {
  day: number;
  step: string;
}

/** Steps for a given day, plus earlier steps not yet done (carried over). */
export function stepsDueOn(steps: RescueStep[], progress: Record<string, string>, day: number) {
  return steps
    .map((s, index) => ({ ...s, index, done: Boolean(progress[index]) }))
    .filter((s) => s.day === day || (s.day < day && !s.done));
}

export function planLength(steps: RescueStep[]): number {
  return steps.reduce((max, s) => Math.max(max, s.day), 1);
}

/** Suggest ending the rescue once the plant scores healthy again. */
export const RECOVERED_HEALTH = 65;
export function looksRecovered(health: number): boolean {
  return health >= RECOVERED_HEALTH;
}
