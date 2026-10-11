import { describe, expect, it } from "vitest";
import { careEventText, careLogText } from "./log";
import { planAfterLoggedWatering, wateringIntervalDays, type WateringInput } from "./watering";

const DAY = 86_400_000;
const start = new Date(2026, 3, 1, 9); // April: neutral season
const input = (daysIn: number): Omit<WateringInput, "learnedFactor"> & { learnedFactor: number } => ({
  baseIntervalDays: 10,
  date: new Date(start.getTime() + daysIn * DAY),
  potDiameterCm: 15,
  potMaterial: "plastic",
  hasDrainage: true,
  windowDirection: "E",
  learnedFactor: 1,
});
const cycle = { startedAt: start, dueAt: new Date(start.getTime() + 10 * DAY) };

describe("logged watering", () => {
  it("learns to water more often when the soil was dry well before the reminder", () => {
    const plan = planAfterLoggedWatering("dry", input(5), cycle);
    expect(plan.learnedFactor).toBeCloseTo(Math.sqrt(0.5));
    expect(plan.intervalDays).toBeLessThan(10);
    expect(plan.nextDueAt.getTime()).toBe(input(5).date.getTime() + plan.intervalDays * DAY);
  });

  it("doesn't learn from a watering within a day of the reminder", () => {
    expect(planAfterLoggedWatering("dry", input(9.5), cycle).learnedFactor).toBe(1);
    expect(planAfterLoggedWatering("dry", input(12), cycle).learnedFactor).toBe(1);
  });

  it("doesn't learn when the owner didn't check the soil, but still restarts the cycle", () => {
    const plan = planAfterLoggedWatering("unknown", input(4), cycle);
    expect(plan.learnedFactor).toBe(1);
    expect(plan.intervalDays).toBe(wateringIntervalDays({ ...input(4), learnedFactor: 1 }));
    expect(plan.nextDueAt.getTime()).toBe(input(4).date.getTime() + 10 * DAY);
  });

  it("limits how far one very early watering moves the schedule", () => {
    expect(planAfterLoggedWatering("dry", input(1), cycle).learnedFactor).toBeCloseTo(Math.sqrt(0.5));
  });

  it("learns more when the plant was droopy, and stays within bounds", () => {
    expect(planAfterLoggedWatering("dry_drooping", input(5), cycle).learnedFactor).toBeCloseTo(Math.sqrt(0.5) * 0.85);
    expect(planAfterLoggedWatering("dry_drooping", { ...input(5), learnedFactor: 0.5 }, cycle).learnedFactor).toBe(0.5);
  });

  it("just restarts the cycle without a known cycle", () => {
    expect(planAfterLoggedWatering("dry", input(5), null).learnedFactor).toBe(1);
  });
});

describe("care history text", () => {
  it("combines the label with the note or soil", () => {
    expect(careEventText({ type: "water", note: null, soil_feedback: "dry" })).toBe("Watered · soil was dry");
    expect(careEventText({ type: "prune", note: "2 yellow leaves", soil_feedback: null })).toBe("Pruned · 2 yellow leaves");
    expect(careEventText({ type: "fertilize", note: null, soil_feedback: null })).toBe("Fed");
  });

  it("shows the note alone when it already says it", () => {
    expect(careEventText({ type: "repot", note: "Repotted into a 17 cm pot", soil_feedback: null })).toBe("Repotted into a 17 cm pot");
    expect(careEventText({ type: "other", note: "Photo from Ana", soil_feedback: null })).toBe("Photo from Ana");
  });

  it("lists the newest first for the AI", () => {
    const lines = careLogText([
      { type: "water", note: null, soil_feedback: "dry", done_at: "2026-10-01T10:00:00Z" },
      { type: "fertilize", note: 'said "half"', soil_feedback: null, done_at: "2026-10-05T10:00:00Z" },
    ]);
    expect(lines).toEqual(["2026-10-05: Fed · said 'half'", "2026-10-01: Watered · soil was dry"]);
  });
});
