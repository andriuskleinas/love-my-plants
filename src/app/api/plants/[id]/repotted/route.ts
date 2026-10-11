import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logRepot } from "@/lib/care/log.server";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

// "I repotted it": new pot size, repot date, and a fresh plan.
const bodySchema = z.object({
  potDiameterCm: z.number().min(4).max(100),
  /** When it was repotted, if not just now (logged from "Log care"). */
  doneAt: z.iso.datetime({ offset: true }).optional(),
});

export async function POST(request: NextRequest, ctx: RouteContext<"/api/plants/[id]/repotted">) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "No pot size was chosen. Choose the new pot size.");

    const now = new Date();
    const doneAt = parsed.data.doneAt ? new Date(Math.min(new Date(parsed.data.doneAt).getTime(), now.getTime())) : now;
    await logRepot(supabase, userId, id, parsed.data.potDiameterCm, doneAt);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
