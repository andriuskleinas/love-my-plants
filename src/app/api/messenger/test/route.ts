import { NextResponse } from "next/server";
import { chatForUser } from "@/lib/messenger/links.server";
import { sendTelegramMessage } from "@/lib/messenger/telegram";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const userId = await requireUserId(await createClient());
    const chatId = await chatForUser("telegram", userId);
    if (!chatId) throw new HttpError(404, "Telegram isn't connected yet. Tap Connect Telegram first.");
    await sendTelegramMessage(chatId, "🌱 <b>Test from Love My Plants.</b> This is where your watering reminders will arrive.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
