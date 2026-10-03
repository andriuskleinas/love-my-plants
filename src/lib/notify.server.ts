import "server-only";
import { chatForUser } from "@/lib/messenger/links.server";
import { sendTelegramMessage, telegramConfigured } from "@/lib/messenger/telegram";
import { sendPushToUser, type PushPayload } from "@/lib/push";

/** Sends one message on every connected channel (Telegram first, then browser push). */
export async function notifyUser(
  userId: string,
  msg: { html: string; push: PushPayload },
): Promise<boolean> {
  let delivered = false;
  const chatId = telegramConfigured() ? await chatForUser("telegram", userId) : null;
  if (chatId) {
    try {
      await sendTelegramMessage(chatId, msg.html);
      delivered = true;
    } catch (error) {
      console.error("telegram nudge failed", (error as Error).message);
    }
  }
  return (await sendPushToUser(userId, msg.push)) > 0 || delivered;
}

