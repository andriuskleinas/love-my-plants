import { MESSAGES } from "@/lib/errors";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

// PATCH {stepIndex, done} ticks a rescue step. POST {outcome} ends the rescue.
const tickSchema = z.object({ stepIndex: z.number().int().min(0).max(19), done: z.boolean() });
const endSchema = z.object({ outcome: z.enum(["recovered", "propagated", "lost"]) });

async function activeRescue(supabase: Awaited<ReturnType<typeof createClient>>, plantId: string) {
  const { data } = await supabase
    .from("rescue_plans")
    .select("id, progress, steps")
    .eq("plant_id", plantId)
    .is("ended_at", null)
    .maybeSingle();
  if (!data) throw new HttpError(404, "There's no active rescue for this plant anymore. It may have just been ended. Refresh the page.");
  return data;
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/plants/[id]/rescue">) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    await requireUserId(supabase);
    const parsed = tickSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, MESSAGES.badRequest);

    const rescue = await activeRescue(supabase, id);
    if (parsed.data.stepIndex >= (rescue.steps as unknown[]).length) throw new HttpError(400, "This rescue step doesn't exist anymore because the plan was updated. Refresh the page.");
    const progress = { ...(rescue.progress as Record<string, string>) };
    if (parsed.data.done) progress[parsed.data.stepIndex] = new Date().toISOString();
    else delete progress[parsed.data.stepIndex];

    const { data, error } = await supabase.from("rescue_plans").update({ progress }).eq("id", rescue.id).select("id");
    if (error) throw error;
    if (!data.length) throw new HttpError(403, "Only household members can tick rescue steps. Plant-sitters can water and send photos, but not change plans.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/plants/[id]/rescue">) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    await requireUserId(supabase);
    const parsed = endSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, MESSAGES.badRequest);

    const rescue = await activeRescue(supabase, id);
    const { data, error } = await supabase
      .from("rescue_plans")
      .update({ ended_at: new Date().toISOString(), outcome: parsed.data.outcome })
      .eq("id", rescue.id)
      .select("id");
    if (error) throw error;
    if (!data.length) throw new HttpError(403, "Only household members can end a rescue. Plant-sitters can water and send photos, but not change plans.");

    // Lost plants leave the list but keep their history.
    await supabase
      .from("plants")
      .update({ status: parsed.data.outcome === "lost" ? "archived" : "ok" })
      .eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
