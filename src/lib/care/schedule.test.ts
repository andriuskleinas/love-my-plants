import { describe, expect, it } from "vitest";
import { endOfLocalDay, localTime, parseClock, shouldSendDigest } from "./schedule";
import { planAfterWaterReminder } from "./watering";

describe("local time", () => {
  const now = new Date("2026-10-03T21:30:00Z");

  it("converts to the user's zone, including the date change", () => {
    expect(localTime("Europe/Vilnius", now)).toEqual({ date: "2026-10-04", minutes: 30 });
    expect(localTime("America/New_York", now)).toEqual({ date: "2026-10-03", minutes: 17 * 60 + 30 });
  });

  it("falls back to UTC for unknown zones", () => {
    expect(localTime("Mars/Olympus", now)).toEqual({ date: "2026-10-03", minutes: 21 * 60 + 30 });
  });

  it("finds the end of the local day", () => {
    expect(endOfLocalDay("Europe/Vilnius", now).toISOString()).toBe("2026-10-04T21:00:00.000Z");
    expect(endOfLocalDay("UTC", now).toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });
});

describe("daily digest timing", () => {
  it("waits until the chosen time, then sends once per day", () => {
    const local = { date: "2026-10-04", minutes: parseClock("08:59") };
    expect(shouldSendDigest({ local, digestTime: "09:00:00", lastDigestOn: null })).toBe(false);
    const later = { date: "2026-10-04", minutes: parseClock("09:15") };
    expect(shouldSendDigest({ local: later, digestTime: "09:00:00", lastDigestOn: "2026-10-03" })).toBe(true);
    expect(shouldSendDigest({ local: later, digestTime: "09:00:00", lastDigestOn: "2026-10-04" })).toBe(false);
  });
});

describe("answering a watering reminder", () => {
  const input = {
    baseIntervalDays: 7,
    date: new Date("2026-04-15T08:00:00Z"),
    potDiameterCm: 15,
    potMaterial: "plastic" as const,
    hasDrainage: true,
    windowDirection: "E" as const,
    learnedFactor: 1,
  };
  const days = (d: Date) => Math.round((d.getTime() - input.date.getTime()) / 86400000);

  it("dry soil: watered, next reminder one interval away", () => {
    const plan = planAfterWaterReminder("dry", input);
    expect(plan).toMatchObject({ watered: true, learnedFactor: 1, intervalDays: 7 });
    expect(days(plan.nextDueAt)).toBe(7);
  });

  it("still damp: not watered, ask again in 2 days, longer intervals from now on", () => {
    const plan = planAfterWaterReminder("damp", input);
    expect(plan.watered).toBe(false);
    expect(days(plan.nextDueAt)).toBe(2);
    expect(plan.intervalDays).toBe(8);
  });

  it("dry and drooping: watered, shorter intervals from now on", () => {
    const plan = planAfterWaterReminder("dry_drooping", input);
    expect(plan.watered).toBe(true);
    expect(plan.intervalDays).toBe(6);
    expect(days(plan.nextDueAt)).toBe(6);
  });

  it("snooze: nothing learned, ask again tomorrow", () => {
    const plan = planAfterWaterReminder("snooze", input);
    expect(plan).toMatchObject({ watered: false, learnedFactor: 1 });
    expect(days(plan.nextDueAt)).toBe(1);
  });
});
