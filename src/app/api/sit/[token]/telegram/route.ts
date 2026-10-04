import { NextResponse, type NextRequest } from "next/server";
import { sitterForToken } from "@/lib/circle.server";
import { chatFor, createLinkToken, formatLinkCode } from "@/lib/messenger/links.server";
import { getBotUsername, telegramConfigured } from "@/lib/messenger/telegram";
import { errorResponse, HttpError } from "@/lib/plants/server";

// GET → is this sitter's Telegram connected? POST → one-time connect code for the sitter.
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/sit/[token]/telegram">) {
  try {
    const sitter = await sitterForToken((await ctx.params).token);
    if (!sitter) throw new HttpError(404, "This plant-sitting link doesn't work anymore. The owner may have replaced it with a new one. Ask them to send the link again.");
    return NextResponse.json({
      available: telegramConfigured(),
      connected: telegramConfigured() ? !!(await chatFor("telegram", { memberId: sitter.memberId })) : false,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/sit/[token]/telegram">) {
  try {
    const sitter = await sitterForToken((await ctx.params).token);
    if (!sitter || sitter.status === "ended") throw new HttpError(403, "Your plant-sitting dates have ended, so this link can't connect Telegram anymore. Thank you for helping!");
    if (!telegramConfigured()) throw new HttpError(503, "Telegram reminders aren't available right now because the bot isn't configured. Please try again later.");
    const token = await createLinkToken({ memberId: sitter.memberId });
    const bot = await getBotUsername();
    return NextResponse.json({ url: `https://t.me/${bot}?start=${token}`, code: formatLinkCode(token), bot });
  } catch (error) {
    return errorResponse(error);
  }
}
