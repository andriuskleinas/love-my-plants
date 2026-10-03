import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { answerAsSitter } from "@/lib/care/sitter.server";
import { sitterForToken } from "@/lib/circle.server";
import { errorResponse, HttpError } from "@/lib/plants/server";

// A plant-sitter (no account) answers a watering reminder from their link page.
const bodySchema = z.object({ taskId: z.uuid(), outcome: z.enum(["dry", "damp", "dry_drooping", "snooze"]) });

export async function POST(request: NextRequest, ctx: RouteContext<"/api/sit/[token]/answer">) {
  try {
    const { token } = await ctx.params;
    const sitter = await sitterForToken(token);
    if (!sitter) throw new HttpError(404, "This link isn't valid anymore.");
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Invalid request.");
    const result = await answerAsSitter(sitter, parsed.data.taskId, parsed.data.outcome);
    return NextResponse.json({ nextDueAt: result.nextDueAt });
  } catch (error) {
    return errorResponse(error);
  }
}
