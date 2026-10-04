import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { sitterForToken } from "@/lib/circle.server";
import { escapeHtml } from "@/lib/messenger/types";
import { notifyUser } from "@/lib/notify.server";
import { errorResponse, HttpError, PHOTO_BUCKET } from "@/lib/plants/server";
import { createAdminClient } from "@/lib/supabase/server";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// A plant-sitter sends a photo of a plant; it joins the plant's photos and the owner is told.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/sit/[token]/photo">) {
  try {
    const { token } = await ctx.params;
    const sitter = await sitterForToken(token);
    if (!sitter || sitter.status !== "active") throw new HttpError(403, "Plant-sitting hasn't started yet or has already ended, so this can't be marked. Check your dates with the plant owner.");

    const form = await request.formData();
    const plantId = String(form.get("plantId") ?? "");
    const file = form.get("photo");
    if (!sitter.plantIds.includes(plantId)) throw new HttpError(404, "This plant isn't one of the plants you're looking after, so it can't be changed from your link.");
    if (!(file instanceof File) || !TYPES.has(file.type) || file.size > MAX_BYTES) {
      throw new HttpError(400, "That photo couldn't be sent: it's either bigger than 5 MB or not a JPEG, PNG or WebP image. Take a new photo with the camera instead.");
    }

    const admin = createAdminClient();
    const { data: plant } = await admin.from("plants").select("nickname, home_id").eq("id", plantId).maybeSingle();
    if (!plant || plant.home_id !== sitter.homeId) throw new HttpError(404, "This plant doesn't exist anymore. It may have been deleted. Go back to your plants and refresh.");

    const path = `${plant.home_id}/${plantId}/${randomUUID()}.jpg`;
    const { error: upErr } = await admin.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type });
    if (upErr) throw upErr;
    const { data: photo, error } = await admin
      .from("photos")
      .insert({ plant_id: plantId, kind: "checkin", storage_path: path })
      .select("id")
      .single();
    if (error) throw error;
    await admin.from("care_events").insert({
      plant_id: plantId,
      type: "other",
      note: `Photo from ${sitter.name}`,
      done_by_member: sitter.memberId,
      photo_id: photo.id,
    });

    await notifyUser(sitter.ownerId, {
      html: `📷 <b>${escapeHtml(sitter.name)}</b> sent a photo of <b>${escapeHtml(plant.nickname)}</b>. Open its page in the app to see it.`,
      push: { title: `📷 ${sitter.name} sent a photo`, body: plant.nickname, url: `/plants/${plantId}`, tag: `sitter-photo-${plantId}` },
    }).catch(() => false);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
