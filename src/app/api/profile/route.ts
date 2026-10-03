import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  digestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  hemisphere: z.enum(["north", "south"]).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Invalid settings.");
    const update: Record<string, string> = {};
    if (parsed.data.digestTime) update.digest_time = parsed.data.digestTime;
    if (parsed.data.hemisphere) update.hemisphere = parsed.data.hemisphere;
    const { error } = await supabase.from("profiles").update(update).eq("id", userId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
