import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { LOG_TYPES, NOTE_MAX } from "@/lib/care/log";
import { logWatering, memberIdFor } from "@/lib/care/tasks.server";
import { MESSAGES } from "@/lib/errors";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

// "I did something": logs care the owner did on their own. Repotting has its own route (new pot size).
const bodySchema = z.object({
  type: z.enum(LOG_TYPES).exclude(["repot"]),
  doneAt: z.iso.datetime({ offset: true }),
  soil: z.enum(["dry", "dry_drooping", "unknown"]).optional(),
  note: z.string().trim().max(NOTE_MAX).optional(),
});

/** How far back care can be logged. */
const MAX_DAYS_BACK = 31;

export async function POST(request: NextRequest, ctx: RouteContext<"/api/plants/[id]/care">) {
  try {
    const { id: plantId } = await ctx.params;
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, MESSAGES.badRequest);
    const { type, soil, note } = parsed.data;

    const now = new Date();
    const doneAt = new Date(Math.min(new Date(parsed.data.doneAt).getTime(), now.getTime()));
    if (now.getTime() - doneAt.getTime() > MAX_DAYS_BACK * 86_400_000) {
      throw new HttpError(400, `This date is too far back. Choose a day in the last ${MAX_DAYS_BACK} days.`);
    }
    if (type === "other" && !note) throw new HttpError(400, "Nothing was written. Write what you did.");

    if (type === "water") {
      if (!soil) throw new HttpError(400, "The soil wasn't chosen. Choose how the soil was.");
      return NextResponse.json(await logWatering(supabase, userId, plantId, soil, doneAt, note || null));
    }

    const { data: plant } = await supabase.from("plants").select("home_id").eq("id", plantId).maybeSingle();
    if (!plant) throw new HttpError(404, "This plant no longer exists. Go back to your plants.");
    const { error } = await supabase.from("care_events").insert({
      plant_id: plantId,
      type,
      note: note || null,
      done_at: doneAt.toISOString(),
      done_by_member: await memberIdFor(supabase, userId, plant.home_id),
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
