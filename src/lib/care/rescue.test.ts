import { describe, expect, it } from "vitest";
import { looksRecovered, planLength, rescueDay, stepsDueOn } from "./rescue";

describe("rescue day", () => {
  const start = new Date("2026-10-03T18:30:00Z"); // 21:30 in Vilnius
  const tz = "Europe/Vilnius";
  it("counts calendar days in the owner's time zone, starting at 1", () => {
    expect(rescueDay(start, new Date("2026-10-03T20:00:00Z"), tz)).toBe(1); // 23:00 same evening
    expect(rescueDay(start, new Date("2026-10-03T21:30:00Z"), tz)).toBe(2); // 00:30 next day in Vilnius
    expect(rescueDay(start, new Date("2026-10-03T21:30:00Z"), "UTC")).toBe(1); // still the 3rd in UTC
    expect(rescueDay(start, new Date("2026-10-10T09:00:00Z"), tz)).toBe(8);
  });
});

describe("steps due", () => {
  const steps = [
    { day: 1, step: "Unpot and trim black roots" },
    { day: 1, step: "Repot in dry soil" },
    { day: 3, step: "Check the soil" },
    { day: 7, step: "Photo check" },
  ];

  it("shows today's steps and carries over unfinished earlier ones", () => {
    const due = stepsDueOn(steps, { "0": "2026-10-03" }, 3);
    expect(due.map((s) => s.step)).toEqual(["Repot in dry soil", "Check the soil"]);
  });

  it("knows how long the plan is", () => {
    expect(planLength(steps)).toBe(7);
  });

  it("suggests ending the rescue once healthy", () => {
    expect(looksRecovered(70)).toBe(true);
    expect(looksRecovered(50)).toBe(false);
  });
});
