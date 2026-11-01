import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CutoutError, removeBackground } from "@/lib/plants/cutout.server";
import { CUTTABLE_KINDS, PICTURE_KINDS } from "@/lib/plants/pictures";
import { FILE_TITLE } from "@/lib/plants/stock-photos";
import { fetchStockPhoto, findStockPhotos } from "@/lib/plants/stock-photos.server";
import { MESSAGES, nextUtcMidnight } from "@/lib/errors";
import { errorResponse, HttpError, PHOTO_BUCKET, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

// The plant's picture: one of its photos, a new photo, a free species photo from Wikimedia Commons,
// or one of its photos with the background removed.
// A chosen picture is pinned, so check-ins no longer replace it; "auto" goes back to the newest check-in.

const bodySchema = z.union([
  z.object({ photoId: z.uuid() }),
  z.object({ path: z.string().min(1).max(200) }),
  z.object({ stockFile: z.string().regex(FILE_TITLE) }),
  z.object({ cutoutOf: z.uuid() }),
  z.object({ auto: z.literal(true) }),
]);

const NOT_FOUND = "This plant no longer exists. Go back to your plants.";
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
/** Per person per day, so one account can't use up the household's monthly remove.bg allowance. */
const DAILY_CUTOUT_LIMIT = 10;
const CUTOUT_MESSAGES: Record<CutoutError["reason"], [number, string]> = {
  not_configured: [503, "Background removal isn't set up yet. Use the photo as it is for now."],
  no_credits: [429, "This month's free background removals are used up. Use the photo as it is for now, or try again next month."],
  no_subject: [422, "No plant could be found in this photo. Pick a photo that shows the whole plant clearly."],
  failed: [502, "The background couldn't be removed. Try again in a few minutes."],
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadPlant(supabase: Supabase, id: string) {
  const { data: plant } = await supabase.from("plants").select("id, home_id, species_name").eq("id", id).maybeSingle();
  if (!plant) throw new HttpError(404, NOT_FOUND);
  return plant;
}

/** Species photos to choose from. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/plants/[id]/cover">) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    await requireUserId(supabase);
    const plant = await loadPlant(supabase, id);
    if (!plant.species_name) {
      throw new HttpError(404, "The species of this plant isn't known yet. Pick one of your own photos instead.");
    }
    try {
      return NextResponse.json({ candidates: await findStockPhotos(plant.species_name) });
    } catch (error) {
      console.error("stock photo search failed:", error);
      throw new HttpError(502, "Photos from Wikimedia Commons couldn't be loaded. Try again in a few minutes.");
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/plants/[id]/cover">) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, MESSAGES.badRequest);
    const body = parsed.data;
    const plant = await loadPlant(supabase, id);

    let update: { cover_photo_id?: string | null; cover_pinned: boolean };
    if ("auto" in body) {
      const { data: newest } = await supabase
        .from("photos")
        .select("id")
        .eq("plant_id", id)
        .in("kind", ["whole", "checkin"])
        .order("taken_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      update = { cover_pinned: false, ...(newest ? { cover_photo_id: newest.id } : {}) };
    } else if ("photoId" in body) {
      const { data: photo } = await supabase
        .from("photos")
        .select("id")
        .eq("id", body.photoId)
        .eq("plant_id", id)
        .in("kind", [...PICTURE_KINDS])
        .maybeSingle();
      if (!photo) throw new HttpError(404, "This photo no longer exists. Pick another one.");
      update = { cover_photo_id: photo.id, cover_pinned: true };
    } else if ("path" in body) {
      // Uploaded by the browser into this plant's own folder.
      if (!body.path.startsWith(`${plant.home_id}/${plant.id}/`) || body.path.includes("..")) {
        throw new HttpError(400, "This photo couldn't be used. Please take it again.");
      }
      const { data: photo, error } = await supabase
        .from("photos")
        .insert({ plant_id: id, kind: "cover", storage_path: body.path, taken_by: userId })
        .select("id")
        .single();
      if (error) throw error;
      update = { cover_photo_id: photo.id, cover_pinned: true };
    } else if ("cutoutOf" in body) {
      const { data: source } = await supabase
        .from("photos")
        .select("storage_path")
        .eq("id", body.cutoutOf)
        .eq("plant_id", id)
        .in("kind", [...CUTTABLE_KINDS])
        .maybeSingle();
      if (!source) throw new HttpError(404, "This photo no longer exists. Pick another one.");
      const { count } = await supabase
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("kind", "cutout")
        .eq("taken_by", userId)
        .gte("taken_at", `${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
      if ((count ?? 0) >= DAILY_CUTOUT_LIMIT) {
        throw new HttpError(429, `You've removed the background from ${DAILY_CUTOUT_LIMIT} photos today.`, nextUtcMidnight());
      }
      const { data: original, error: downloadError } = await supabase.storage.from(PHOTO_BUCKET).download(source.storage_path);
      if (downloadError || !original) throw new HttpError(404, "This photo no longer exists. Pick another one.");
      const png = await removeBackground(original).catch((error) => {
        if (!(error instanceof CutoutError)) throw error;
        console.error("cutout failed:", error.message);
        throw new HttpError(...CUTOUT_MESSAGES[error.reason]);
      });
      const path = `${plant.home_id}/${plant.id}/${randomUUID()}.png`;
      const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, png, { contentType: "image/png" });
      if (uploadError) throw uploadError;
      const { data: photo, error } = await supabase
        .from("photos")
        .insert({ plant_id: id, kind: "cutout", storage_path: path, taken_by: userId })
        .select("id")
        .single();
      if (error) throw error;
      update = { cover_photo_id: photo.id, cover_pinned: true };
    } else {
      const stock = await fetchStockPhoto(body.stockFile).catch((error) => {
        console.error("stock photo download failed:", error);
        return null;
      });
      if (!stock) throw new HttpError(502, "This photo couldn't be downloaded. Pick another one.");
      const path = `${plant.home_id}/${plant.id}/${randomUUID()}.${EXT[stock.contentType]}`;
      const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, stock.bytes, { contentType: stock.contentType });
      if (uploadError) throw uploadError;
      const { data: photo, error } = await supabase
        .from("photos")
        .insert({ plant_id: id, kind: "stock", storage_path: path, taken_by: userId, credit: stock.credit })
        .select("id")
        .single();
      if (error) throw error;
      update = { cover_photo_id: photo.id, cover_pinned: true };
    }

    const { data, error } = await supabase.from("plants").update(update).eq("id", id).select("id");
    if (error) throw error;
    if (!data.length) throw new HttpError(403, "You can't change this plant's picture. Ask a household member to do it.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
