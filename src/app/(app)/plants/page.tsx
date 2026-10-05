import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { PaintDefs, SnapScene } from "@/components/landing/illustrations";
import { PlantGrid } from "@/components/plant-grid";
import { needsCheckin } from "@/lib/care/plan";
import { daysAhead } from "@/lib/care/today";
import { healthTrend, nextAction, type PlantCard } from "@/lib/plants/collection";
import { PHOTO_BUCKET } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Plants · Love My Plants" };

export default async function PlantsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login?next=/plants");

  const [{ data: plants }, { data: profile }] = await Promise.all([
    supabase
      .from("plants")
      .select("id, nickname, species_name, status, created_at, cover:photos!plants_cover_photo_fk(storage_path)")
      .neq("status", "archived")
      .order("created_at"),
    supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle(),
  ]);
  const tz = profile?.timezone ?? "UTC";
  const now = new Date();

  const ids = (plants ?? []).map((p) => p.id);
  const coverPath = (p: NonNullable<typeof plants>[number]) =>
    (Array.isArray(p.cover) ? p.cover[0] : p.cover)?.storage_path as string | undefined;
  const paths = (plants ?? []).map(coverPath).filter((x): x is string => !!x);

  const [{ data: assessments }, { data: tasks }, { data: photos }, { data: signed }] = ids.length
    ? await Promise.all([
        supabase.from("assessments").select("plant_id, health").in("plant_id", ids).order("created_at", { ascending: false }),
        supabase
          .from("care_tasks")
          .select("plant_id, due_at")
          .in("plant_id", ids)
          .eq("type", "water")
          .in("status", ["pending", "snoozed"])
          .order("due_at"),
        supabase.from("photos").select("plant_id, taken_at").in("plant_id", ids).order("taken_at", { ascending: false }),
        paths.length
          ? supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600)
          : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  // Every list is sorted newest/soonest first, so the first entries per plant are the ones we want.
  const checks = new Map<string, (number | null)[]>();
  assessments?.forEach((a) => {
    const list = checks.get(a.plant_id) ?? [];
    if (list.length < 2) checks.set(a.plant_id, [...list, a.health]);
  });
  const water = new Map<string, string>();
  tasks?.forEach((t) => water.has(t.plant_id) || water.set(t.plant_id, t.due_at));
  const lastPhoto = new Map<string, string>();
  photos?.forEach((p) => lastPhoto.has(p.plant_id) || lastPhoto.set(p.plant_id, p.taken_at));
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const cards: PlantCard[] = (plants ?? []).map((p) => {
    const [health = null, previous = null] = checks.get(p.id) ?? [];
    const waterDue = water.get(p.id) ?? null;
    const taken = lastPhoto.get(p.id);
    const state = {
      er: p.status === "er",
      waterIn: waterDue ? daysAhead(tz, now, new Date(waterDue)) : null,
      waterDue,
      checkinDue: needsCheckin(taken ? new Date(taken) : null, now),
    };
    return {
      id: p.id,
      nickname: p.nickname,
      species: p.species_name,
      photoUrl: urls.get(coverPath(p) ?? "") ?? null,
      createdAt: p.created_at,
      health,
      trend: healthTrend(health, previous),
      ...state,
      next: nextAction(state, tz, now),
    };
  });

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 sm:max-w-2xl lg:max-w-4xl">
      <PageHeader title="Plants">
        {cards.length > 0 && <span className="text-sm text-muted">{cards.length === 1 ? "1 plant" : `${cards.length} plants`}</span>}
      </PageHeader>
      {cards.length ? (
        <PlantGrid plants={cards} />
      ) : (
        <section className="mx-auto mt-6 max-w-sm text-center">
          <PaintDefs />
          <div className="mx-auto h-48 w-56 rounded-3xl bg-cream p-4">
            <SnapScene />
          </div>
          <h2 className="mt-6 text-xl font-semibold">Your plants will live here</h2>
          <p className="mt-2 text-muted">Take a photo of your first plant and we&apos;ll tell you how it&apos;s doing and how to care for it.</p>
          <Link href="/plants/new" className="mt-6 inline-block rounded-full bg-leaf px-6 py-3 font-medium text-background">
            Add your first plant
          </Link>
        </section>
      )}
    </main>
  );
}
