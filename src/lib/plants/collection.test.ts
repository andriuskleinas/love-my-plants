import { describe, expect, it } from "vitest";
import { healthTrend, matchesSearch, nextAction, shortDay, sortPlants, type PlantCard } from "./collection";

const TZ = "Europe/Vilnius";
// Sunday 4 October 2026, 18:30 in Vilnius (UTC+3).
const now = new Date("2026-10-04T15:30:00Z");

const card = (id: string, over: Partial<PlantCard> = {}): PlantCard => ({
  id,
  nickname: id,
  species: null,
  photoUrl: null,
  createdAt: "2026-10-01T00:00:00Z",
  er: false,
  health: 80,
  trend: null,
  waterIn: 3,
  checkinDue: false,
  next: null,
  ...over,
});

describe("plants collection", () => {
  it("calls small changes in health steady", () => {
    expect(healthTrend(82, 70)).toBe("up");
    expect(healthTrend(60, 72)).toBe("down");
    expect(healthTrend(74, 71)).toBe("steady");
    expect(healthTrend(74, null)).toBeNull();
  });

  it("labels the next watering briefly in the user's time zone", () => {
    expect(shortDay(TZ, now, new Date("2026-10-05T09:00:00Z"))).toBe("Tomorrow");
    expect(shortDay(TZ, now, new Date("2026-10-06T09:00:00Z"))).toBe("Tue");
    expect(shortDay(TZ, now, new Date("2026-10-14T09:00:00Z"))).toBe("14 Oct");
  });

  it("points each card at the most urgent thing", () => {
    const base = { er: false, waterIn: 2, waterDue: "2026-10-06T09:00:00Z", checkinDue: false };
    expect(nextAction({ ...base, er: true }, TZ, now)?.text).toBe("Needs help");
    expect(nextAction({ ...base, waterIn: -1 }, TZ, now)).toEqual({ icon: "💧", text: "Water overdue", urgent: true });
    expect(nextAction({ ...base, waterIn: 0 }, TZ, now)?.text).toBe("Water today");
    expect(nextAction({ ...base, checkinDue: true }, TZ, now)?.text).toBe("Check-in due");
    expect(nextAction(base, TZ, now)).toEqual({ icon: "💧", text: "Water Tue", urgent: false });
    expect(nextAction({ ...base, waterIn: null, waterDue: null }, TZ, now)).toBeNull();
  });

  it("sorts plants that need attention first", () => {
    const plants = [
      card("fine"),
      card("thirsty", { waterIn: 0 }),
      card("sick", { health: 40 }),
      card("rescue", { er: true }),
      card("so-so", { health: 60 }),
      card("photo", { checkinDue: true }),
      card("later", { waterIn: 6 }),
    ];
    expect(sortPlants(plants, "attention").map((p) => p.id)).toEqual(["rescue", "thirsty", "sick", "so-so", "photo", "fine", "later"]);
  });

  it("sorts by name and by newest", () => {
    const plants = [
      card("b", { nickname: "basil", createdAt: "2026-10-03T00:00:00Z" }),
      card("a", { nickname: "Aloe", createdAt: "2026-10-01T00:00:00Z" }),
      card("c", { nickname: "cactus", createdAt: "2026-10-04T00:00:00Z" }),
    ];
    expect(sortPlants(plants, "name").map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(sortPlants(plants, "newest").map((p) => p.id)).toEqual(["c", "b", "a"]);
  });

  it("searches names and species, ignoring case and accents", () => {
    const p = { nickname: "Žalia", species: "Monstera deliciosa" };
    expect(matchesSearch(p, "zal")).toBe(true);
    expect(matchesSearch(p, "MONSTERA")).toBe(true);
    expect(matchesSearch(p, "ficus")).toBe(false);
    expect(matchesSearch(p, "  ")).toBe(true);
  });
});
