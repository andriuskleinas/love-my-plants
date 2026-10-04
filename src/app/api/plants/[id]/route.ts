import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorResponse, HttpError, requireUserId, speciesSlug } from "@/lib/plants/server";

const updateSchema = z.object({
  nickname: z.string().trim().min(1).max(40).optional(),
  speciesName: z.string().trim().min(1).max(120).optional(),
});

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/plants/[id]">) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    await requireUserId(supabase);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Your plant needs a name (up to 40 characters) before it can be saved.");

    const update: Record<string, string | null> = {};
    if (parsed.data.nickname) update.nickname = parsed.data.nickname;
    if (parsed.data.speciesName) {
      update.species_name = parsed.data.speciesName;
      // Link the cached care profile only if we already have one for this species.
      const { data: profile } = await supabase
        .from("species_profiles")
        .select("id")
        .eq("id", speciesSlug(parsed.data.speciesName))
        .maybeSingle();
      update.species_id = profile?.id ?? null;
    }

    const { data, error } = await supabase.from("plants").update(update).eq("id", id).select("id");
    if (error) throw error;
    if (!data.length) throw new HttpError(404, "This plant doesn't exist anymore. It may have been deleted. Go back to your plants and refresh.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/plants/[id]">) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    await requireUserId(supabase);
    const { data: plant } = await supabase.from("plants").select("home_id").eq("id", id).maybeSingle();
    if (!plant) throw new HttpError(404, "This plant doesn't exist anymore. It may have been deleted. Go back to your plants and refresh.");

    // Remove photo files first: listing them needs the plant row to still exist.
    const prefix = `${plant.home_id}/${id}`;
    const { data: files } = await supabase.storage.from("plant-photos").list(prefix, { limit: 1000 });
    if (files?.length) await supabase.storage.from("plant-photos").remove(files.map((f) => `${prefix}/${f.name}`));

    const { data, error } = await supabase.from("plants").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data.length) throw new HttpError(403, "Only household members can delete plants. Plant-sitters can water and send photos, but not change plants.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
