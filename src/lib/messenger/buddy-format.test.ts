import { describe, expect, it } from "vitest";
import { decodeShopping, encodeBought, formatBuddyReply, formatShoppingList, MAX_MESSAGE } from "./buddy-format";

describe("buddy reply", () => {
  it("leads with the product verdict and alternative", () => {
    const html = formatBuddyReply(
      {
        reply: "Mix in a handful of perlite.",
        productCheck: { product: "Universal potting soil 10 L", forPlant: "Monty", verdict: "tweak", reason: "Too dense for a Monstera.", alternative: "Aroid mix" },
        addToShoppingList: [],
      },
      ["Perlite"],
    );
    expect(html.startsWith("<b>⚠️ OK with a tweak for Monty</b>")).toBe(true);
    expect(html).toContain("👉 <b>Look for:</b> Aroid mix");
    expect(html).toContain("🛒 Added to your list: Perlite");
  });

  it("escapes text and respects Telegram's length limit", () => {
    const html = formatBuddyReply({ reply: "<script>" + "a".repeat(5000), productCheck: null, addToShoppingList: [] }, []);
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
