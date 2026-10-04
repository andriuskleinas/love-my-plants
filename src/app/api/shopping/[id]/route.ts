import { MESSAGES } from "@/lib/errors";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { setItemStatus, shoppingHomeFor } from "@/lib/care/shopping.server";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ status: z.enum(["open", "bought", "dismissed"]) });

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/shopping/[id]">) {
  try {
    const { id } = await ctx.params;
    const userId = await requireUserId(await createClient());
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, MESSAGES.badRequest);
    const homeId = await shoppingHomeFor(userId);
    if (!homeId || !(await setItemStatus(homeId, id, parsed.data.status))) throw new HttpError(404, "This item is no longer on the list. Refresh the page.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
