import { describe, expect, it } from "vitest";
import {
  applySoilFeedback,
  daylightHours,
  hemisphereOf,
  combineWindowSides,
  windowDirectionName,
  initialWaterDueAt,
  lightFactor,
  nextWaterAt,
  seasonFactor,
  waterAmountMl,
  wateringIntervalDays,
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  type WateringInput,
} from "./watering";
import { evaluateRepot, nextPotSize } from "./repot";
import { canAccessPlant, canManageHome } from "./access";
import { assessmentSchema, needsEmergency } from "../ai/schemas";

const base: WateringInput = {
  baseIntervalDays: 7,
  date: new Date(2026, 3, 15), // April: neutral season
  potDiameterCm: 15,
  potMaterial: "plastic",
  hasDrainage: true,
  windowDirection: "E",
};

describe("watering interval", () => {
  it("returns the species base under neutral conditions", () => {
    expect(wateringIntervalDays(base)).toBe(7);
  });

  it("waters less often in winter and more often in summer", () => {
    const winter = wateringIntervalDays({ ...base, date: new Date(2026, 0, 10) });
    const summer = wateringIntervalDays({ ...base, date: new Date(2026, 6, 10) });
    expect(winter).toBeGreaterThan(7);
    expect(summer).toBeLessThan(7);
  });

  it("knows daylight hours by latitude", () => {
    const vilnius = 54.7;
    expect(daylightHours(vilnius, new Date("2026-12-21T12:00:00Z"))).toBeCloseTo(7, 0);
    expect(daylightHours(vilnius, new Date("2026-06-21T12:00:00Z"))).toBeCloseTo(17.3, 0);
    expect(daylightHours(0, new Date("2026-06-21T12:00:00Z"))).toBeCloseTo(12.1, 0);
    expect(daylightHours(78, new Date("2026-06-21T12:00:00Z"))).toBe(24);
  });

  it("follows real daylight when the location is known", () => {
    const at = (iso: string, latitude: number) =>
      wateringIntervalDays({ ...base, baseIntervalDays: 10, date: new Date(iso), latitude });
    expect(at("2026-12-21T12:00:00Z", 54.7)).toBe(15); // dark Vilnius winter: much less often
    expect(at("2026-06-21T12:00:00Z", 54.7)).toBe(8); // long summer days: more often
    expect(at("2026-12-21T12:00:00Z", 1.3)).toBe(10); // Singapore: no real seasons
    expect(at("2026-06-21T12:00:00Z", -33.9)).toBeGreaterThan(10); // Sydney winter in June
    expect(hemisphereOf(-33.9)).toBe("south");
  });

  it("flips seasons and sunny side for the southern hemisphere", () => {
    expect(seasonFactor(new Date(2026, 0, 10), "south")).toBe(0.85);
    expect(lightFactor("N", "south")).toBe(0.85);
    expect(lightFactor("S", "south")).toBe(1.15);
  });

  it("treats in-between windows as halfway between their two sides", () => {
    expect(lightFactor("SW")).toBeCloseTo((0.85 + 0.9) / 2);
    expect(lightFactor("NE", "south")).toBeCloseTo((0.85 + 1.0) / 2);
  });

  it("dries faster in terracotta, slower without drainage", () => {
    expect(wateringIntervalDays({ ...base, baseIntervalDays: 10, potMaterial: "terracotta" })).toBeLessThan(10);
    expect(wateringIntervalDays({ ...base, baseIntervalDays: 10, hasDrainage: false })).toBeGreaterThan(10);
  });

  it("clamps to a sane range", () => {
    expect(wateringIntervalDays({ ...base, baseIntervalDays: 0.5 })).toBe(MIN_INTERVAL_DAYS);
    expect(wateringIntervalDays({ ...base, baseIntervalDays: 200 })).toBe(MAX_INTERVAL_DAYS);
  });

  it("computes the next watering date", () => {
    expect(nextWaterAt(new Date("2026-10-01T09:00:00Z"), 5).toISOString()).toBe("2026-10-06T09:00:00.000Z");
  });

  it("suggests a reasonable amount of water", () => {
    expect(waterAmountMl(12)).toBe(150);
    expect(waterAmountMl(17)).toBe(400);
    expect(waterAmountMl(6)).toBe(50);
  });
});

describe("window sides", () => {
  it("combines neighbouring sides into one direction in either tap order", () => {
    expect(combineWindowSides([])).toBe("none");
    expect(combineWindowSides(["S"])).toBe("S");
    expect(combineWindowSides(["S", "W"])).toBe("SW");
    expect(combineWindowSides(["W", "S"])).toBe("SW");
    expect(combineWindowSides(["E", "N"])).toBe("NE");
  });

  it("keeps the last tap for opposite sides", () => {
    expect(combineWindowSides(["N", "S"])).toBe("S");
  });

  it("names directions in plain words", () => {
    expect(windowDirectionName("SW")).toBe("south-west");
    expect(windowDirectionName("E")).toBe("east");
  });
});

describe("first watering reminder", () => {
  const now = new Date("2026-10-03T08:00:00Z");
  const days = (d: Date) => Math.round((d.getTime() - now.getTime()) / 86400000);

  it("is due today for a thirsty plant", () => {
    expect(days(initialWaterDueAt(30, 8, now))).toBe(0);
  });

  it("is half an interval away for a so-so plant and a full one for a well-watered plant", () => {
    expect(days(initialWaterDueAt(60, 8, now))).toBe(4);
    expect(days(initialWaterDueAt(90, 8, now))).toBe(8);
  });
});

describe("soil feedback learning loop", () => {
  const now = new Date("2026-10-03T08:00:00Z");

  it("snoozes 2 days and lengthens intervals when soil is still damp", () => {
    const r = applySoilFeedback(1, "damp", now);
    expect(r.learnedFactor).toBeCloseTo(1.15);
    expect(r.snoozeUntil?.toISOString()).toBe("2026-10-05T08:00:00.000Z");
  });

  it("shortens intervals when the plant is drooping and dry", () => {
    expect(applySoilFeedback(1, "dry_drooping", now).learnedFactor).toBeCloseTo(0.85);
  });

  it("keeps the factor within bounds", () => {
    let f = 1;
    for (let i = 0; i < 20; i++) f = applySoilFeedback(f, "damp", now).learnedFactor;
    expect(f).toBe(2);
  });
});

describe("repot plan", () => {
  it("steps up to the next standard pot size", () => {
    expect(nextPotSize(14)).toBe(17);
    expect(nextPotSize(15)).toBe(17);
  });

  it("is urgent now when roots show during the growing season", () => {
    const p = evaluateRepot({ now: new Date(2026, 4, 1), potDiameterCm: 14, rootsVisible: true, repotIntervalMonths: 24 });
    expect(p.urgency).toBe("now");
    expect(p.recommendedPotCm).toBe(17);
  });

  it("waits for spring when urgent in winter", () => {
    const p = evaluateRepot({ now: new Date(2026, 10, 1), potDiameterCm: 14, rootsVisible: true, repotIntervalMonths: 24 });
    expect(p.urgency).toBe("soon");
    expect(p.suggestedDate).toEqual(new Date(2027, 2, 15));
  });

  it("flags a plant that has outgrown its pot", () => {
    const p = evaluateRepot({ now: new Date(2026, 4, 1), potDiameterCm: 12, heightCm: 60, repotIntervalMonths: 24 });
    expect(p.urgency).toBe("soon");
    expect(p.reasons[0]).toMatch(/too big/);
  });

  it("plans the routine repot in the growing season", () => {
    const p = evaluateRepot({
      now: new Date(2026, 9, 3),
      potDiameterCm: 17,
      heightCm: 30,
      lastRepottedAt: new Date(2025, 10, 1),
      repotIntervalMonths: 18,
    });
    expect(p.urgency).toBe("later");
    expect(p.suggestedDate).toEqual(new Date(2027, 4, 1)); // May 2027 is already in season
  });
});

describe("care circle access", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  const sitter = {
    role: "sitter" as const,
    startsAt: new Date("2026-07-05"),
    endsAt: new Date("2026-07-20"),
    plantScope: ["p1"],
  };

  it("lets household members see every plant", () => {
    expect(canAccessPlant({ role: "household" }, "p9", now)).toBe(true);
  });

  it("limits sitters to scoped plants within their dates", () => {
    expect(canAccessPlant(sitter, "p1", now)).toBe(true);
    expect(canAccessPlant(sitter, "p2", now)).toBe(false);
    expect(canAccessPlant(sitter, "p1", new Date("2026-07-21"))).toBe(false);
    expect(canAccessPlant(sitter, "p1", new Date("2026-07-01"))).toBe(false);
  });

  it("never lets sitters manage the home", () => {
    expect(canManageHome(sitter, now)).toBe(false);
    expect(canManageHome({ role: "owner" }, now)).toBe(true);
  });
});

describe("AI output", () => {
  const score = { value: 70, why: "ok", confidence: 0.8 };
  const valid = {
    photoQuality: { ok: true, retakeHint: null },
    species: [{ name: "Monstera deliciosa", commonName: "Swiss cheese plant", confidence: 0.92 }],
    scores: { health: score, leaves: score, pests: score, hydration: score, soil: score, light: score, pot: score, growth: score },
    issues: [],
    actions: [{ step: "Water ~250 ml", why: "Soil is dry", taskType: "water" }],
    estimatedHeightCm: 45,
    repotSignals: { rootsVisible: false, drainsTooFast: false },
    suggestedNickname: "Monty",
    careProfile: {
      baseWaterIntervalDays: 7,
      repotIntervalMonths: 24,
      light: "Bright indirect",
      humidity: "50%+",
      temperature: "18–27 °C",
      fertilizer: "Monthly in spring and summer",
      soilMix: "Aroid mix",
      toxicToPets: true,
    },
    rescuePlan: null,
  };

  it("accepts a well-formed assessment", () => {
    expect(assessmentSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects out-of-range scores and too many actions", () => {
    expect(assessmentSchema.safeParse({ ...valid, scores: { ...valid.scores, health: { ...score, value: 140 } } }).success).toBe(false);
    expect(assessmentSchema.safeParse({ ...valid, actions: Array(4).fill(valid.actions[0]) }).success).toBe(false);
  });

  it("triggers Plant ER on low health or a sharp drop", () => {
    expect(needsEmergency(35)).toBe(true);
    expect(needsEmergency(55, 80)).toBe(true);
    expect(needsEmergency(65, 75)).toBe(false);
  });
});
