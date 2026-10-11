import { describe, expect, it } from "vitest";
import {
  decodeShopping,
  decodeUndoCare,
  encodeBought,
  encodeUndoCare,
  formatBuddyReply,
  formatLoggedCare,
  formatShoppingList,
  MAX_MESSAGE,
} from "./buddy-format";

describe("buddy reply", () => {
  it("leads with the product verdict and alternative", () => {
    const html = formatBuddyReply(
      {
        reply: "Mix in a handful of perlite.",
        productCheck: { product: "Universal potting soil 10 L", forPlant: "Monty", verdict: "tweak", reason: "Too dense for a Monstera.", alternative: "Aroid mix" },
        addToShoppingList: [],
        logCare: [],
      },
      ["Perlite"],
    );
    expect(html.startsWith("<b>⚠️ OK with a tweak for Monty</b>")).toBe(true);
    expect(html).toContain("👉 <b>Look for:</b> Aroid mix");
    expect(html).toContain("🛒 Added to your list: Perlite");
  });

  it("escapes text and respects Telegram's length limit", () => {
    const html = formatBuddyReply({ reply: "<script>" + "a".repeat(5000), productCheck: null, addToShoppingList: [], logCare: [] }, []);
    expect(html.startsWith("&lt;script&gt;")).toBe(true);
    expect(html.length).toBeLessThanOrEqual(MAX_MESSAGE);
  });
});

describe("shopping list", () => {
  const id = "3f8a1c2e-1234-4abc-9def-0123456789ab";
  it("lists open items with a bought button each, and offers suggestions", () => {
    const { html, buttons } = formatShoppingList(
      [{ id, item: "17 cm pot", reason: null, status: "open", plantNickname: "Monty" }],
      [{ item: "Liquid fertilizer", reason: "Feeding season starts soon" }],
    );
    expect(html).toContain("• 17 cm pot <i>(Monty)</i>");
    expect(html).toContain("Coming up for your plants");
    expect(buttons[0][0]).toEqual({ text: "✓ 17 cm pot", data: encodeBought(id) });
    expect(buttons.at(-1)![0].data).toBe("sa");
  });

  it("decodes button payloads", () => {
    expect(decodeShopping(encodeBought(id))).toEqual({ kind: "bought", id });
    expect(decodeShopping("sa")).toEqual({ kind: "addSuggestions" });
    expect(decodeShopping("w:whatever")).toBeNull();
  });
});

describe("care saved from chat", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";

  it("confirms each entry with an Undo button", () => {
    const m = formatLoggedCare([
      { ok: true, eventId: id, nickname: "Sir <Hiss>", type: "water", daysAgo: 0, nextWater: "in 6 days", learned: true },
      { ok: false, nickname: "Bob", error: "No plant has this name." },
    ]);
    expect(m.html).toContain("💧 <b>Sir &lt;Hiss&gt;</b>: watered today. Next watering in 6 days. It dries out faster");
    expect(m.html).toContain("⚠️ Bob: No plant has this name.");
    expect(m.buttons).toEqual([[{ text: "↩️ Undo: Watered Sir <Hiss>", data: `cu:${id}` }]]);
    expect(encodeUndoCare(id).length).toBeLessThanOrEqual(64);
  });

  it("says nothing was saved when every entry failed", () => {
    const m = formatLoggedCare([{ ok: false, nickname: "Bob", error: "No plant has this name." }]);
    expect(m.html.startsWith("📝 <b>Nothing was saved</b>")).toBe(true);
    expect(m.buttons).toEqual([]);
  });

  it("round-trips the Undo payload and rejects others", () => {
    expect(decodeUndoCare(encodeUndoCare(id))).toBe(id);
    expect(decodeUndoCare("s:" + id)).toBeNull();
  });
});
