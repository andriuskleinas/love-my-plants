import { describe, expect, it } from "vitest";
import { feedingSeason, needsCheckin, scoreDelta } from "./plan";
import { evaluateRepot } from "./repot";

describe("feeding season", () => {
  it("runs mid-March to mid-September in the north", () => {
    const oct = feedingSeason(new Date(2026, 9, 3));
    expect(oct.active).toBe(false);
    expect(oct.start).toEqual(new Date(2027, 2, 15));
    expect(feedingSeason(new Date(2026, 5, 1)).active).toBe(true);
  });

  it("runs mid-September to mid-March in the south, across new year", () => {
    const jan = feedingSeason(new Date(2027, 0, 10), "south");
    expect(jan.active).toBe(true);
    expect(jan.start).toEqual(new Date(2026, 8, 15));
    expect(jan.end).toEqual(new Date(2027, 2, 15));
    expect(feedingSeason(new Date(2026, 5, 1), "south").active).toBe(false);
  });
});

describe("weekly check-in", () => {
  const now = new Date("2026-10-10T10:00:00Z");
  it("is due a week after the last photo", () => {
    expect(needsCheckin(new Date("2026-10-04T10:00:00Z"), now)).toBe(false);
    expect(needsCheckin(new Date("2026-10-03T10:00:00Z"), now)).toBe(true);
    expect(needsCheckin(null, now)).toBe(true);
  });
});

describe("repot plan when the last repot is unknown", () => {
  it("counts from when we started tracking, and doesn't drift forward on every check", () => {
    const a = evaluateRepot({ now: new Date(2026, 9, 3), potDiameterCm: 12, repotIntervalMonths: 12, trackingSince: new Date(2026, 9, 3) });
    const b = evaluateRepot({ now: new Date(2026, 10, 20), potDiameterCm: 12, repotIntervalMonths: 12, trackingSince: new Date(2026, 9, 3) });
    expect(a.suggestedDate).toEqual(b.suggestedDate);
    expect(a.urgency).toBe("later");
  });

  it("flags plants that have been in the same pot past their interval", () => {
    const now = new Date(2027, 4, 1);
    const p = evaluateRepot({ now, potDiameterCm: 12, repotIntervalMonths: 6, trackingSince: new Date(2026, 9, 3) });
    expect(p.urgency).toBe("soon");
    expect(p.suggestedDate).toEqual(now); // May: growing season, so the window is open now
    expect(p.reasons[0]).toMatch(/same pot for at least 7 months/);
  });
});

describe("score changes", () => {
  it("compares with the previous check", () => {
    expect(scoreDelta(80, 72)).toBe(8);
    expect(scoreDelta(80, null)).toBeNull();
  });
});
