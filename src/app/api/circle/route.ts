import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashToken, newInviteToken } from "@/lib/circle.server";
import { errorResponse, getManagedHomeId, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

// Invite someone to the Care Circle. Returns the link once (only its hash is stored).
const inviteSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("household"), name: z.string().trim().min(1).max(40) }),
  z.object({
    role: z.literal("sitter"),
    name: z.string().trim().min(1).max(40),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    plantIds: z.array(z.uuid()).min(1).max(100),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const parsed = inviteSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "The invite is missing details. Add their name, and for a plant-sitter also the dates and plants.");
    const homeId = await getManagedHomeId(supabase, userId);
    const token = newInviteToken();
    const data = parsed.data;

    let row: Record<string, unknown> = { home_id: homeId, display_name: data.name, role: data.role, invite_token_hash: hashToken(token) };
    if (data.role === "sitter") {
      if (new Date(data.endsAt) <= new Date(data.startsAt)) throw new HttpError(400, "The end date is before the start date. Check the dates.");
      // Only plants from this home.
      const { data: plants } = await supabase.from("plants").select("id").eq("home_id", homeId).in("id", data.plantIds);
      if (!plants?.length) throw new HttpError(400, "No plants were chosen. Choose at least one plant.");
      row = { ...row, starts_at: data.startsAt, ends_at: data.endsAt, plant_scope: plants.map((p) => p.id) };
    }

    // RLS: only owners/household of this home can invite.
    const { data: member, error } = await supabase.from("home_members").insert(row).select("id").single();
    if (error) throw error;

    const origin = new URL(request.url).origin;
    return NextResponse.json({ id: member.id, url: `${origin}/${data.role === "sitter" ? "sit" : "join"}/${token}` });
  } catch (error) {
    return errorResponse(error);
  }
}
