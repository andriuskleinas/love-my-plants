import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { WINDOW_DIRECTIONS } from "@/lib/care/watering";
import { createClient } from "@/lib/supabase/server";
import { errorResponse, getManagedHomeId, HttpError, requireUserId } from "@/lib/plants/server";

const createSchema = z.object({
  potDiameterCm: z.number().min(4).max(100),
  potMaterial: z.enum(["plastic", "ceramic", "terracotta", "other"]).default("plastic"),
  hasDrainage: z.boolean(),
  windowDirection: z.enum(WINDOW_DIRECTIONS),
});

// Creates a draft plant so its photos have a storage folder; the nickname is set after the check.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Some questions aren't answered. Answer the pot size, drainage and window questions.");

    const homeId = await getManagedHomeId(supabase, userId);
    const { data, error } = await supabase
      .from("plants")
      .insert({
        home_id: homeId,
        nickname: "New plant",
        pot_diameter_cm: parsed.data.potDiameterCm,
        pot_material: parsed.data.potMaterial,
        has_drainage: parsed.data.hasDrainage,
        window_direction: parsed.data.windowDirection,
        created_by: userId,
      })
      .select("id, home_id")
      .single();
    if (error) throw error;

    return NextResponse.json({ id: data.id, homeId: data.home_id });
  } catch (error) {
    return errorResponse(error);
  }
}
