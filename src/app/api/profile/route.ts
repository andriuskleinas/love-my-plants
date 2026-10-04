import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hemisphereOf } from "@/lib/care/watering";
import { roundCoord } from "@/lib/geo.server";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  digestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  displayName: z.string().trim().min(1).max(40).optional(),
  hemisphere: z.enum(["north", "south"]).optional(),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      area: z.string().trim().min(1).max(120),
    })
    .nullable()
    .optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "This setting wasn't saved. Please choose it again.");
    const update: Record<string, string | number | null> = {};
    if (parsed.data.digestTime) update.digest_time = parsed.data.digestTime;
    if (parsed.data.displayName) update.display_name = parsed.data.displayName;
    if (parsed.data.hemisphere) update.hemisphere = parsed.data.hemisphere;
    const loc = parsed.data.location;
    if (loc) {
      // Store only the area (~1 km), and derive the hemisphere from it.
      update.latitude = roundCoord(loc.latitude);
      update.longitude = roundCoord(loc.longitude);
      update.location_name = loc.area;
      update.hemisphere = hemisphereOf(loc.latitude);
    } else if (loc === null) {
      update.latitude = null;
      update.longitude = null;
      update.location_name = null;
    }
    const { error } = await supabase.from("profiles").update(update).eq("id", userId);
    // Keep the name shown in the Care Circle in sync.
    if (!error && parsed.data.displayName) {
      // Server-side: users can't edit their own owner membership row under RLS.
      await createAdminClient().from("home_members").update({ display_name: parsed.data.displayName }).eq("user_id", userId);
    }
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
