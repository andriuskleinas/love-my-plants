import { MESSAGES } from "@/lib/errors";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assessmentSchema } from "@/lib/ai/schemas";
import { memberIdFor } from "@/lib/care/tasks.server";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

// Ticks or unticks one of the AI's "Today" steps for a plant.
const bodySchema = z.object({
  assessmentId: z.uuid(),
  index: z.number().int().min(0).max(2),
  done: z.boolean(),
});

export async function POST(request: NextRequest, ctx: RouteContext<"/api/plants/[id]/steps">) {
  try {
    const { id: plantId } = await ctx.params;
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, MESSAGES.badRequest);
    const { assessmentId, index, done } = parsed.data;

    if (!done) {
      const { error } = await supabase
        .from("care_events")
        .delete()
        .eq("assessment_id", assessmentId)
        .eq("action_index", index)
        .eq("plant_id", plantId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const { data: row } = await supabase
      .from("assessments")
      .select("raw, plant:plants(home_id)")
      .eq("id", assessmentId)
      .eq("plant_id", plantId)
      .maybeSingle();
    const action = row ? assessmentSchema.safeParse(row.raw).data?.actions[index] : undefined;
    const plant = Array.isArray(row?.plant) ? row.plant[0] : row?.plant;
    if (!action || !plant) throw new HttpError(404, "This step is from an older check and can't be ticked anymore. Refresh the page to see the current steps.");

    const { error } = await supabase.from("care_events").upsert(
      {
        plant_id: plantId,
        type: action.taskType,
        assessment_id: assessmentId,
        action_index: index,
        note: action.step,
        done_by_member: await memberIdFor(supabase, userId, plant.home_id),
      },
      { onConflict: "assessment_id,action_index", ignoreDuplicates: true },
    );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
