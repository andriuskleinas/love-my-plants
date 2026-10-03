// Watering reminder messages with answer buttons, shared by all messengers.
import type { WaterOutcome } from "@/lib/care/watering";
import { escapeHtml, type ButtonRows } from "./types";

const OUTCOME_CODES: Record<WaterOutcome, string> = { dry: "d", damp: "m", dry_drooping: "x", snooze: "s" };
const CODE_OUTCOMES = Object.fromEntries(Object.entries(OUTCOME_CODES).map(([k, v]) => [v, k])) as Record<string, WaterOutcome>;

/** Button payload: "w:<taskId>:<code>" (well under Telegram's 64-byte limit). */
export function encodeWaterAnswer(taskId: string, outcome: WaterOutcome): string {
  return `w:${taskId}:${OUTCOME_CODES[outcome]}`;
}

export function decodeWaterAnswer(data: string): { taskId: string; outcome: WaterOutcome } | null {
  const m = /^w:([0-9a-f-]{36}):([dmxs])$/.exec(data);
  return m ? { taskId: m[1], outcome: CODE_OUTCOMES[m[2]] } : null;
}

export function waterRemindersIntro(count: number): string {
  return `💧 <b>${count} plants need water today.</b>\nFor each one, first push a finger 2–3 cm into the soil.`;
}

export function waterReminderMessage(task: { taskId: string; nickname: string; amount: string }): {
  html: string;
  buttons: ButtonRows;
} {
  return {
    html:
      `💧 <b>${escapeHtml(task.nickname)}</b> needs water today, about ${escapeHtml(task.amount)}.\n` +
      `Push a finger 2–3 cm into the soil. Is it dry?`,
    buttons: [
      [
        { text: "✅ Dry, watered it", data: encodeWaterAnswer(task.taskId, "dry") },
        { text: "💧 Still damp", data: encodeWaterAnswer(task.taskId, "damp") },
      ],
      [
        { text: "🥀 Droopy, watered it", data: encodeWaterAnswer(task.taskId, "dry_drooping") },
        { text: "⏰ Tomorrow", data: encodeWaterAnswer(task.taskId, "snooze") },
      ],
    ],
  };
}

/** Text that replaces the reminder once it's answered. */
export function waterAnswerSummary(nickname: string, outcome: WaterOutcome, nextLabel: string): string {
  const name = `<b>${escapeHtml(nickname)}</b>`;
  switch (outcome) {
    case "dry":
      return `✅ ${name} watered. Next watering: ${nextLabel}.`;
    case "dry_drooping":
      return `✅ ${name} watered. It was thirsty, so we'll water a bit more often. Next: ${nextLabel}.`;
    case "damp":
      return `💧 ${name} skipped, soil still damp. We'll check again ${nextLabel} and space out waterings a little.`;
    case "snooze":
      return `⏰ ${name}: we'll remind you ${nextLabel}.`;
  }
}
