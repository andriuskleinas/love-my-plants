import { MESSAGES } from "@/lib/errors";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

// PATCH {key, done} ticks a prep item. DELETE cancels the trip.
const tickSchema = z.object({ key: z.string().min(1).max(80), done: z.boolean() });

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/vacations/[id]">) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    await requireUserId(supabase);
    const parsed = tickSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, MESSAGES.badRequest);
    const { data: trip } = await supabase.from("vacations").select("prep_checklist").eq("id", id).maybeSingle();
    if (!trip) throw new HttpError(404, "This trip doesn't exist anymore. It may have been cancelled. Refresh the page.");
    const done = new Set<string>((trip.prep_checklist as { done?: string[] })?.done ?? []);
    if (parsed.data.done) done.add(parsed.data.key);
    else done.delete(parsed.data.key);
    const { error } = await supabase.from("vacations").update({ prep_checklist: { done: [...done] } }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/vacations/[id]">) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    await requireUserId(supabase);
    const { data, error } = await supabase.from("vacations").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data.length) throw new HttpError(404, "This trip doesn't exist anymore. It may have been cancelled. Refresh the page.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
