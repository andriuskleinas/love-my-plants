import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { answerWaterTask } from "@/lib/care/tasks.server";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ outcome: z.enum(["dry", "damp", "dry_drooping", "snooze"]) });

export async function POST(request: NextRequest, ctx: RouteContext<"/api/tasks/[id]/answer">) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Unknown answer.");
    return NextResponse.json(await answerWaterTask(supabase, userId, id, parsed.data.outcome));
  } catch (error) {
    return errorResponse(error);
  }
}
