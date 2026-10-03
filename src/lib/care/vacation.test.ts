import { describe, expect, it } from "vitest";
import { tripDays, vacationPrep, vacationStatus, type VacationPlant } from "./vacation";

const fern: VacationPlant = { id: "f", nickname: "Fern", intervalDays: 5, windowDirection: "S", potMaterial: "terracotta", inRescue: false };
const cactus: VacationPlant = { id: "c", nickname: "Spike", intervalDays: 20, windowDirection: "N", potMaterial: "plastic", inRescue: false };
const at = (iso: string) => new Date(iso);

describe("vacation prep", () => {
  it("only needs a normal watering when the trip is shorter than the interval", () => {
    const items = vacationPrep({ plants: [cactus], startsAt: at("2026-10-10"), endsAt: at("2026-10-17"), hasSitter: false });
    expect(items.filter((i) => i.plantId === "c").map((i) => i.key)).toEqual(["water-c"]);
  });

  it("adds deep watering, shade, pebble tray and a wick for a long trip", () => {
    const items = vacationPrep({ plants: [fern, cactus], startsAt: at("2026-10-10"), endsAt: at("2026-10-24"), hasSitter: false });
    const fernKeys = items.filter((i) => i.plantId === "f").map((i) => i.key);
    expect(fernKeys).toEqual(["deep-water-f", "shade-f", "terracotta-f", "wick-f"]);
    expect(items.map((i) => i.key)).toContain("group");
    expect(items.map((i) => i.key)).toContain("no-feeding");
    expect(items.at(-1)!.when).toBe("return");
  });

  it("leaves watering to the sitter, but asks for a walkthrough", () => {
    const items = vacationPrep({ plants: [fern], startsAt: at("2026-10-10"), endsAt: at("2026-10-24"), hasSitter: true });
    expect(items.some((i) => i.plantId === "f")).toBe(false);
    expect(items[0].key).toBe("sitter-walkthrough");
  });

  it("flags plants in rescue when nobody will look after them", () => {
    const items = vacationPrep({ plants: [{ ...fern, inRescue: true }], startsAt: at("2026-10-10"), endsAt: at("2026-10-12"), hasSitter: false });
    expect(items[0].key).toBe("rescue-f");
  });

  it("counts trip days and status", () => {
    expect(tripDays(at("2026-10-10"), at("2026-10-24"))).toBe(14);
    expect(vacationStatus(at("2026-10-10"), at("2026-10-24"), at("2026-10-12"))).toBe("active");
    expect(vacationStatus(at("2026-10-10"), at("2026-10-24"), at("2026-10-01"))).toBe("upcoming");
  });
});
