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

export function rescueDayMessage(
  nickname: string,
  day: number,
  length: number,
  steps: string[],
  photoToday: boolean,
): string {
  const list = steps.length
    ? steps.map((s, i) => `${i + 1}. ${escapeHtml(s)}`).join("\n")
    : "Nothing to do today. Rest, light and patience. 🌿";
  const photo = photoToday ? "\n\n📸 Today is a photo check-in: snap it in the app to see how it's responding." : "";
  return `🚨 <b>${escapeHtml(nickname)}: rescue day ${Math.min(day, length)} of ${length}</b>\n${list}${photo}`;
}

export function repotNudgeMessage(nickname: string, potCm: number, reasons: string[]): string {
  const why = reasons.length ? `\nWhy: ${reasons.map(escapeHtml).join("; ")}.` : "";
  return (
    `🪴 <b>Time to repot ${escapeHtml(nickname)}</b> in the next few days.\n` +
    `Move it to a <b>${potCm} cm</b> pot with a drainage hole and fresh soil.${why}\n\n` +
    `Afterwards, tap "I repotted it" on its page in the app.`
  );
}

/** Links only work once the app has a public https address. */
export function checkinNudgeMessage(nicknames: string[], appUrl?: string): string {
  const names = nicknames.map((n) => `<b>${escapeHtml(n)}</b>`).join(", ");
  const link = appUrl?.startsWith("https://") ? `\n\n<a href="${appUrl}">Open Love My Plants</a>` : "";
  return (
    `📸 <b>Weekly check-in</b>\nSnap a photo of ${names} to update the health check and grow the time-lapse. ` +
    `Same spot and angle as last time works best.${link}`
  );
}
