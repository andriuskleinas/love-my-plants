import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseAssessment } from "@/lib/ai/schemas";
import { TIP_ANSWERS, TIP_NOTE_MAX } from "@/lib/care/tips";
import { MESSAGES } from "@/lib/errors";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

// Answers one of the AI's tips: done, can't do it, or later, with an optional note.
const bodySchema = z.object({
  assessmentId: z.uuid(),
  index: z.number().int().min(0).max(2),
  answer: z.enum(TIP_ANSWERS),
  note: z.string().trim().max(TIP_NOTE_MAX).optional(),
});

export async function POST(request: NextRequest, ctx: RouteContext<"/api/plants/[id]/tips">) {
  try {
    const { id: plantId } = await ctx.params;
    const supabase = await createClient();
    await requireUserId(supabase);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, MESSAGES.badRequest);
    const { assessmentId, index, answer, note } = parsed.data;

    const { data: row } = await supabase
      .from("assessments")
      .select("raw")
      .eq("id", assessmentId)
      .eq("plant_id", plantId)
      .maybeSingle();
    const tip = row ? parseAssessment(row.raw)?.actions[index] : undefined;
    if (!tip || tip.kind !== "tip") throw new HttpError(404, "This tip is no longer available. Refresh the page.");

    const { error } = await supabase.from("tip_answers").upsert(
      {
        plant_id: plantId,
        assessment_id: assessmentId,
        action_index: index,
        topic: tip.taskType,
        answer,
        note: note || null,
        answered_at: new Date().toISOString(),
      },
      { onConflict: "assessment_id,action_index" },
    );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
