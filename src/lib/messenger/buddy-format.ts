// Plant Buddy message formatting for chat apps (HTML subset, Telegram limits).
import type { BuddyReply } from "@/lib/ai/schemas";
import { escapeHtml, type ButtonRows } from "./types";

export const MAX_MESSAGE = 4000; // Telegram allows 4096 characters

const VERDICT: Record<NonNullable<BuddyReply["productCheck"]>["verdict"], string> = {
  good: "✅ Good fit",
  tweak: "⚠️ OK with a tweak",
  skip: "❌ Skip it",
};

export function formatBuddyReply(reply: BuddyReply, added: string[]): string {
  const parts: string[] = [];
  const p = reply.productCheck;
  if (p) {
    parts.push(`<b>${VERDICT[p.verdict]}${p.forPlant ? ` for ${escapeHtml(p.forPlant)}` : ""}</b>\n${escapeHtml(p.product)}`);
    parts.push(escapeHtml(p.reason));
    if (p.alternative && p.verdict !== "good") parts.push(`👉 <b>Look for:</b> ${escapeHtml(p.alternative)}`);
  }
  parts.push(escapeHtml(reply.reply));
  if (added.length) parts.push(`🛒 Added to your list: ${added.map(escapeHtml).join(", ")}`);
  const html = parts.join("\n\n");
  return html.length > MAX_MESSAGE ? `${html.slice(0, MAX_MESSAGE - 1)}…` : html;
}

export interface ListItem {
  id: string;
  item: string;
  reason: string | null;
  status: "open" | "bought" | "dismissed";
  plantNickname: string | null;
}

/** Shopping list payloads: "s:<itemId>" marks bought, "sa" adds all suggestions. */
export const encodeBought = (id: string) => `s:${id}`;
export function decodeShopping(data: string): { kind: "bought"; id: string } | { kind: "addSuggestions" } | null {
  if (data === "sa") return { kind: "addSuggestions" };
  const m = /^s:([0-9a-f-]{36})$/.exec(data);
  return m ? { kind: "bought", id: m[1] } : null;
}

export function formatShoppingList(
  items: ListItem[],
  suggestions: { item: string; reason: string }[],
): { html: string; buttons: ButtonRows } {
  const open = items.filter((i) => i.status === "open");
  const bought = items.filter((i) => i.status === "bought");
  const lines: string[] = ["🛒 <b>Shopping list</b>"];
  if (open.length) {
    lines.push(...open.map((i) => `• ${escapeHtml(i.item)}${i.plantNickname ? ` <i>(${escapeHtml(i.plantNickname)})</i>` : ""}`));
  } else {
    lines.push("Nothing on your list.");
  }
  if (bought.length) lines.push("", `✓ Bought: ${bought.map((i) => escapeHtml(i.item)).join(", ")}`);
  if (suggestions.length) {
    lines.push("", "💡 <b>Coming up for your plants:</b>", ...suggestions.map((s) => `• ${escapeHtml(s.item)}: ${escapeHtml(s.reason)}`));
  }
  lines.push("", "Tip: send me a photo of a product in the shop and I'll tell you if it suits your plants.");

  const buttons: ButtonRows = open.slice(0, 20).map((i) => [{ text: `✓ ${i.item}`.slice(0, 60), data: encodeBought(i.id) }]);
  if (suggestions.length) buttons.push([{ text: "➕ Add suggestions to my list", data: "sa" }]);
  return { html: lines.join("\n"), buttons };
}
