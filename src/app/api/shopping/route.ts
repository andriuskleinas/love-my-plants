import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { addShoppingItems, loadShopping, shoppingHomeFor } from "@/lib/care/shopping.server";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

// POST {item} adds one item; POST {suggestions: true} adds all current suggestions.
const bodySchema = z.union([
  z.object({ item: z.string().trim().min(1).max(80), reason: z.string().trim().max(120).optional() }),
  z.object({ suggestions: z.literal(true) }),
]);

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(await createClient());
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "What would you like to add?");
    const homeId = await shoppingHomeFor(userId);
    if (!homeId) throw new HttpError(403, "No home found for your account.");
    if ("suggestions" in parsed.data) {
      const { suggestions } = await loadShopping(homeId);
      const added = await addShoppingItems(homeId, suggestions.map((s) => ({ item: s.item, reason: s.reason, plantId: s.plantId })), "plan");
      return NextResponse.json({ added });
    }
    const added = await addShoppingItems(homeId, [{ item: parsed.data.item, reason: parsed.data.reason ?? null }], "manual");
    return NextResponse.json({ added });
  } catch (error) {
    return errorResponse(error);
  }
}
