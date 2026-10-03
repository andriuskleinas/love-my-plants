import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/messenger/bot.server";

// Telegram webhook. Telegram sends our secret in this header on every update.
export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  const given = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await handleTelegramUpdate((await request.json()) as TelegramUpdate);
  } catch (error) {
    // Still answer 200, otherwise Telegram keeps retrying the same update.
    console.error("telegram update failed", error);
  }
  return NextResponse.json({ ok: true });
}
