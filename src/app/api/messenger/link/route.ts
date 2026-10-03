import { NextResponse } from "next/server";
import { chatForUser, createLinkToken, unlinkChat } from "@/lib/messenger/links.server";
import { getBotUsername, sendTelegramMessage, telegramConfigured } from "@/lib/messenger/telegram";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

// GET → is Telegram connected? POST → one-time t.me link. DELETE → disconnect.
export async function GET() {
  try {
    const userId = await requireUserId(await createClient());
    return NextResponse.json({
      available: telegramConfigured(),
      connected: telegramConfigured() ? !!(await chatForUser("telegram", userId)) : false,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST() {
  try {
    const userId = await requireUserId(await createClient());
    if (!telegramConfigured()) throw new HttpError(503, "Telegram isn't set up yet.");
    const token = await createLinkToken(userId);
    return NextResponse.json({ url: `https://t.me/${await getBotUsername()}?start=${token}` });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId(await createClient());
    const chatId = await chatForUser("telegram", userId);
    if (chatId) {
      await unlinkChat("telegram", chatId);
      await sendTelegramMessage(chatId, "Disconnected from Love My Plants. You won't get reminders here anymore.").catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
