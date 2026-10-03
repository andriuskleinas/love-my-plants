import "server-only";
import type { ButtonRows } from "./types";

// Minimal Telegram Bot API client. https://core.telegram.org/bots/api

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export async function telegramApi<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(method === "getUpdates" ? 40_000 : 10_000),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`telegram ${method}: ${json.description ?? res.status}`);
  return json.result;
}

const keyboard = (buttons?: ButtonRows) =>
  buttons?.length
    ? { inline_keyboard: buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) }
    : undefined;

export function sendTelegramMessage(chatId: string | number, html: string, buttons?: ButtonRows) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard(buttons),
  });
}

/** Replaces a message's text and buttons (e.g. after a button was tapped). */
export function editTelegramMessage(chatId: string | number, messageId: number, html: string, buttons?: ButtonRows) {
  return telegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: html,
    parse_mode: "HTML",
    reply_markup: keyboard(buttons) ?? { inline_keyboard: [] },
  });
}

export function answerTelegramCallback(callbackQueryId: string, text?: string) {
  return telegramApi("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

let botUsername: string | null = null;
export async function getBotUsername(): Promise<string> {
  botUsername ??= (await telegramApi<{ username: string }>("getMe")).username;
  return botUsername;
}

/** Shows "typing…" in the chat for a few seconds while we work. */
export function sendTelegramTyping(chatId: string | number) {
  return telegramApi("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
}

export interface TelegramPhotoSize {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
}

/** Downloads the best photo size for analysis (≤ ~1600 px, like app uploads). */
export async function downloadTelegramPhoto(sizes: TelegramPhotoSize[]): Promise<string> {
  const sorted = [...sizes].sort((a, b) => a.width * a.height - b.width * b.height);
  const pick = [...sorted].reverse().find((s) => Math.max(s.width, s.height) <= 1600) ?? sorted[0];
  const file = await telegramApi<{ file_path: string; file_size?: number }>("getFile", { file_id: pick.file_id });
  if ((file.file_size ?? 0) > 10 * 1024 * 1024) throw new Error("photo too large");
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`photo download ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}
