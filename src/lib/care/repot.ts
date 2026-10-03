// Repot milestone logic (plan F5).

import type { Hemisphere } from "./watering";

export const STANDARD_POT_SIZES_CM = [6, 8, 10, 12, 14, 17, 19, 21, 24, 27, 30, 35, 40, 45, 50];

export interface RepotInput {
  now: Date;
  hemisphere?: Hemisphere;
  potDiameterCm: number;
  heightCm?: number | null;
  rootsVisible?: boolean;
  drainsTooFast?: boolean;
  lastRepottedAt?: Date | null;
  repotIntervalMonths: number;
}

export type RepotUrgency = "now" | "soon" | "later";

export interface RepotPlan {
  urgency: RepotUrgency;
  reasons: string[];
  recommendedPotCm: number;
  suggestedDate: Date;
}

const HEIGHT_TO_POT_RATIO = 2.5;

export function nextPotSize(currentCm: number): number {
  // One step up is 2–5 cm larger; jumping too far causes soggy soil.
  return STANDARD_POT_SIZES_CM.find((s) => s >= currentCm + 2) ?? currentCm + 5;
}

function isGrowingSeason(date: Date, hemisphere: Hemisphere): boolean {
  const month = (date.getMonth() + (hemisphere === "south" ? 6 : 0)) % 12;
  return month >= 2 && month <= 7; // Mar–Aug
}

function nextSpring(date: Date, hemisphere: Hemisphere): Date {
  // March 15 (north) or September 15 (south), whichever comes next.
  const springMonth = hemisphere === "south" ? 8 : 2;
  const candidate = new Date(date.getFullYear(), springMonth, 15);
  if (candidate <= date) candidate.setFullYear(candidate.getFullYear() + 1);
  return candidate;
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export function evaluateRepot(input: RepotInput): RepotPlan {
  const hemisphere = input.hemisphere ?? "north";
  const reasons: string[] = [];
  let strong = 0;
  let mild = 0;

  if (input.rootsVisible) {
    reasons.push("Roots are growing out of the pot");
    strong++;
  }
  if (input.drainsTooFast) {
    reasons.push("Water runs straight through: the pot is mostly roots");
    strong++;
  }
  if (input.heightCm && input.heightCm > input.potDiameterCm * HEIGHT_TO_POT_RATIO) {
    reasons.push(`Plant is ${Math.round(input.heightCm)} cm tall, too big for a ${input.potDiameterCm} cm pot`);
    mild++;
  }
  if (input.lastRepottedAt) {
    const age = monthsBetween(input.lastRepottedAt, input.now);
    if (age >= input.repotIntervalMonths) {
      reasons.push(`Last repotted ${age} months ago`);
      mild++;
    }
  }

  const growing = isGrowingSeason(input.now, hemisphere);
  let urgency: RepotUrgency;
  let suggestedDate: Date;

  if (strong > 0 || mild >= 2) {
    // Urgent signs: repot now if the plant is growing, otherwise first thing in spring.
    urgency = growing ? "now" : "soon";
    suggestedDate = growing ? input.now : nextSpring(input.now, hemisphere);
  } else if (mild === 1) {
    urgency = "soon";
    suggestedDate = growing ? input.now : nextSpring(input.now, hemisphere);
  } else {
    urgency = "later";
    const base = input.lastRepottedAt ?? input.now;
    const due = new Date(base);
    due.setMonth(due.getMonth() + input.repotIntervalMonths);
    suggestedDate = isGrowingSeason(due, hemisphere) ? due : nextSpring(due, hemisphere);
  }

  return { urgency, reasons, recommendedPotCm: nextPotSize(input.potDiameterCm), suggestedDate };
}
