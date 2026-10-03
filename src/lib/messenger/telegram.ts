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
