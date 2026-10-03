import { describe, expect, it } from "vitest";
import { shoppingSuggestions, type ShoppingPlant } from "./shopping";

const now = new Date("2027-02-20T10:00:00Z");
const feedingLater = { start: new Date("2027-09-15"), active: false };

const plant = (over: Partial<ShoppingPlant>): ShoppingPlant => ({
  id: "p1",
  nickname: "Monty",
  soilMix: "Aroid mix",
  repot: { targetDate: new Date("2027-03-15"), urgency: "later", recommendedPotCm: 17 },
  ...over,
});

describe("shopping suggestions", () => {
  it("suggests a pot and soil when a repot is within ~6 weeks", () => {
    const s = shoppingSuggestions({ plants: [plant({})], feeding: feedingLater, now, existing: [] });
    expect(s.map((x) => x.item)).toEqual(["17 cm pot with a drainage hole", "Aroid mix"]);
    expect(s[0].reason).toBe("For repotting Monty");
  });

  it("skips repots that are far away, unless urgent", () => {
    const far = plant({ repot: { targetDate: new Date("2028-03-15"), urgency: "later", recommendedPotCm: 17 } });
    expect(shoppingSuggestions({ plants: [far], feeding: feedingLater, now, existing: [] })).toEqual([]);
    const urgent = plant({ repot: { targetDate: new Date("2028-03-15"), urgency: "soon", recommendedPotCm: 17 } });
    expect(shoppingSuggestions({ plants: [urgent], feeding: feedingLater, now, existing: [] })).toHaveLength(2);
  });

  it("merges the same item for several plants and skips what's already on the list", () => {
    const s = shoppingSuggestions({
      plants: [plant({}), plant({ id: "p2", nickname: "Fern" })],
      feeding: feedingLater,
      now,
      existing: ["aroid  MIX"],
    });
    expect(s).toHaveLength(1);
    expect(s[0].reason).toBe("For repotting Monty, Fern");
    expect(s[0].plantId).toBeNull();
  });

  it("suggests fertilizer a month before feeding season", () => {
    const s = shoppingSuggestions({
      plants: [plant({ repot: null })],
      feeding: { start: new Date("2027-03-15"), active: false },
      now,
      existing: [],
    });
    expect(s.map((x) => x.item)).toEqual(["Liquid houseplant fertilizer"]);
  });
});
