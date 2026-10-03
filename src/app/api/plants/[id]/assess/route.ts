import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assessPlant, AssessmentError, ASSESS_MODEL, type AssessPhoto } from "@/lib/ai/assess";
import { needsEmergency } from "@/lib/ai/schemas";
import { refreshPlantPlan } from "@/lib/care/plan.server";
import { initialWaterDueAt, wateringIntervalDays, waterAmountMl, type Hemisphere } from "@/lib/care/watering";
import {
  consumeAiQuota,
  errorResponse,
  HttpError,
  PHOTO_BUCKET,
  requireUserId,
  speciesSlug,
} from "@/lib/plants/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const bodySchema = z.object({
  photos: z
    .array(
      z.object({
        path: z.string().min(1),
        kind: z.enum(["whole", "soil", "spot", "triage", "checkin"]),
      }),
    )
    .min(1)
    .max(4),
});

export async function POST(request: NextRequest, ctx: RouteContext<"/api/plants/[id]/assess">) {
  try {
    const { id: plantId } = await ctx.params;
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Please add at least one photo.");

    const { data: plant } = await supabase
      .from("plants")
      .select("id, home_id, species_name, pot_diameter_cm, pot_material, has_drainage, window_direction, cover_photo_id")
      .eq("id", plantId)
      .maybeSingle();
    if (!plant) throw new HttpError(404, "Plant not found.");

    // Photos must live in this plant's own folder.
    const prefix = `${plant.home_id}/${plant.id}/`;
    const photos = parsed.data.photos;
    if (photos.some((p) => !p.path.startsWith(prefix) || p.path.includes(".."))) {
      throw new HttpError(400, "Invalid photo.");
    }

    await consumeAiQuota(userId);

    const [{ data: profile }, { data: previous }] = await Promise.all([
      supabase.from("profiles").select("hemisphere, latitude, location_name").eq("id", userId).maybeSingle(),
      supabase
        .from("assessments")
        .select("created_at, health, scores, estimated_height_cm")
        .eq("plant_id", plantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const hemisphere = (profile?.hemisphere ?? "north") as Hemisphere;
    const latitude = profile?.latitude == null ? null : Number(profile.latitude);

    // Download with the user's client, so storage RLS applies.
    const images: AssessPhoto[] = await Promise.all(
      photos.map(async (p) => {
        const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(p.path);
        if (error || !data) throw new HttpError(400, "We couldn't read one of the photos. Please retake it.");
        const mediaType = (["image/png", "image/webp"].includes(data.type) ? data.type : "image/jpeg") as AssessPhoto["mediaType"];
        return { kind: p.kind, mediaType, base64: Buffer.from(await data.arrayBuffer()).toString("base64") };
      }),
    );

    const now = new Date();
    const assessment = await assessPlant(images, {
      speciesHint: plant.species_name,
      potDiameterCm: Number(plant.pot_diameter_cm),
      potMaterial: plant.pot_material,
      hasDrainage: plant.has_drainage,
      waterAmountMl: waterAmountMl(Number(plant.pot_diameter_cm)),
      windowDirection: plant.window_direction,
      hemisphere,
      location: latitude != null && profile?.location_name ? { name: profile.location_name, latitude } : null,
      today: now,
      previous: previous
        ? {
            date: previous.created_at.slice(0, 10),
            health: previous.health,
            scores: Object.fromEntries(
              Object.entries(previous.scores as Record<string, { value: number }>).map(([k, v]) => [k, v.value]),
            ),
            heightCm: previous.estimated_height_cm,
          }
        : null,
    });

    if (!assessment.photoQuality.ok) {
      return NextResponse.json({ retake: assessment.photoQuality.retakeHint ?? "Please take a clearer photo of the whole plant." });
    }

    // Photo rows, written as the user (RLS).
    const { data: photoRows, error: photoError } = await supabase
      .from("photos")
      .insert(photos.map((p) => ({ plant_id: plantId, kind: p.kind, storage_path: p.path, taken_by: userId })))
      .select("id, kind");
    if (photoError) throw photoError;

    // AI results and shared species data are written by the server only.
    const admin = createAdminClient();
    const top = assessment.species[0];
    const speciesName = plant.species_name ?? top?.name ?? null;
    const speciesId = speciesName ? speciesSlug(speciesName) : null;
    if (speciesId) {
      const cp = assessment.careProfile;
      await admin.from("species_profiles").upsert(
        {
          id: speciesId,
          scientific_name: speciesName!,
          common_name: (top?.name === speciesName ? top?.commonName : null) ?? speciesName!,
          base_water_interval_days: cp.baseWaterIntervalDays,
          repot_interval_months: cp.repotIntervalMonths,
          light: cp.light,
          humidity: cp.humidity,
          temperature: cp.temperature,
          fertilizer: cp.fertilizer,
          soil_mix: cp.soilMix,
          toxic_to_pets: cp.toxicToPets,
          updated_at: now.toISOString(),
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
    }

    const { data: saved, error: saveError } = await admin
      .from("assessments")
      .insert({
        plant_id: plantId,
        photo_ids: photoRows.map((r) => r.id),
        health: assessment.scores.health.value,
        scores: assessment.scores,
        issues: assessment.issues,
        actions: assessment.actions,
        estimated_height_cm: assessment.estimatedHeightCm,
        raw: assessment,
        model: ASSESS_MODEL,
      })
      .select("id")
      .single();
    if (saveError) throw saveError;

    const cover = photoRows.find((r) => r.kind === "whole" || r.kind === "checkin") ?? photoRows[0];
    const plantUpdate: Record<string, unknown> = {
      status: needsEmergency(assessment.scores.health.value, previous?.health) ? "er" : "ok",
    };
    // Newest whole-plant view becomes the cover (registration or weekly check-in).
    if (!plant.cover_photo_id || cover.kind === "whole" || cover.kind === "checkin") plantUpdate.cover_photo_id = cover.id;
    if (!plant.species_name && speciesName) {
      plantUpdate.species_name = speciesName;
      plantUpdate.species_id = speciesId;
    }
    const { error: plantError } = await supabase.from("plants").update(plantUpdate).eq("id", plantId);
    if (plantError) throw plantError;

    // First watering reminder for a newly registered plant.
    const { count } = await supabase
      .from("care_tasks")
      .select("id", { count: "exact", head: true })
      .eq("plant_id", plantId)
      .eq("type", "water")
      .in("status", ["pending", "snoozed"]);
    if (!count) {
      const intervalDays = wateringIntervalDays({
        baseIntervalDays: assessment.careProfile.baseWaterIntervalDays,
        date: now,
        hemisphere,
        latitude,
        potDiameterCm: Number(plant.pot_diameter_cm),
        potMaterial: plant.pot_material,
        hasDrainage: plant.has_drainage,
        windowDirection: plant.window_direction,
      });
      const ml = waterAmountMl(Number(plant.pot_diameter_cm));
      const { error: taskError } = await supabase.from("care_tasks").insert({
        plant_id: plantId,
        type: "water",
        title: `Water about ${ml} ml`,
        detail: "Pour slowly until water drains from the bottom, then empty the saucer after 15 minutes.",
        due_at: initialWaterDueAt(assessment.scores.hydration.value, intervalDays, now).toISOString(),
        interval_days: intervalDays,
      });
      if (taskError) throw taskError;
    }

    await refreshPlantPlan(plantId, hemisphere, now);

    return NextResponse.json({
      assessmentId: saved.id,
      assessment,
      previous: previous ? { health: previous.health, scores: previous.scores, date: previous.created_at } : null,
    });
  } catch (error) {
    if (error instanceof AssessmentError) {
      console.error("assessment failed:", error.message);
      return NextResponse.json({ error: error.userMessage }, { status: 502 });
    }
    return errorResponse(error);
  }
}
