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
    if (!parsed.success) throw new HttpError(400, "Invalid request.");
    const homeId = await shoppingHomeFor(userId);
    if (!homeId || !(await setItemStatus(homeId, id, parsed.data.status))) throw new HttpError(404, "Item not found.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
