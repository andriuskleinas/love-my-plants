import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getManagedHomeId, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

const tripSchema = z.object({ startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }) });

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const parsed = tripSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Please choose your dates.");
    const { startsAt, endsAt } = parsed.data;
    if (new Date(endsAt) <= new Date(startsAt)) throw new HttpError(400, "The return date must be after the departure date.");
    if (new Date(endsAt) < new Date()) throw new HttpError(400, "That trip is already over.");

    const homeId = await getManagedHomeId(supabase, userId);
    const { data, error } = await supabase
      .from("vacations")
      .insert({ home_id: homeId, created_by: userId, starts_at: startsAt, ends_at: endsAt, prep_checklist: { done: [] } })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ id: data.id });
  } catch (error) {
    return errorResponse(error);
  }
}
