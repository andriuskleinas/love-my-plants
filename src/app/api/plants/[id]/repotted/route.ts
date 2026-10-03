import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { refreshPlantPlan } from "@/lib/care/plan.server";
import { memberIdFor } from "@/lib/care/tasks.server";
import type { Hemisphere } from "@/lib/care/watering";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

// "I repotted it": new pot size, repot date, and a fresh plan.
const bodySchema = z.object({ potDiameterCm: z.number().min(4).max(100) });

export async function POST(request: NextRequest, ctx: RouteContext<"/api/plants/[id]/repotted">) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Choose the new pot size.");

    const now = new Date();
    const { data: plant, error } = await supabase
      .from("plants")
      .update({ pot_diameter_cm: parsed.data.potDiameterCm, last_repotted_at: now.toISOString() })
      .eq("id", id)
      .select("id, home_id")
      .maybeSingle();
    if (error) throw error;
    if (!plant) throw new HttpError(403, "Only household members can change this plant.");

    await supabase.from("care_events").insert({
      plant_id: id,
      type: "repot",
      note: `Repotted into a ${parsed.data.potDiameterCm} cm pot`,
      done_by_member: await memberIdFor(supabase, userId, plant.home_id),
    });
    const { data: profile } = await supabase.from("profiles").select("hemisphere").eq("id", userId).maybeSingle();
    await refreshPlantPlan(id, (profile?.hemisphere ?? "north") as Hemisphere, now);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
