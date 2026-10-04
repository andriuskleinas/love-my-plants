import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { PlantList, type PlantRow } from "@/components/plant-list";
import { PHOTO_BUCKET } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Plants · Love My Plants" };

export default async function PlantsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login?next=/plants");

  const { data: plants } = await supabase
    .from("plants")
    .select("id, nickname, species_name, status, cover:photos!plants_cover_photo_fk(storage_path)")
    .neq("status", "archived")
    .order("created_at");

  const ids = (plants ?? []).map((p) => p.id);
  const coverPath = (p: NonNullable<typeof plants>[number]) =>
    (Array.isArray(p.cover) ? p.cover[0] : p.cover)?.storage_path as string | undefined;
  const paths = (plants ?? []).map(coverPath).filter((x): x is string => !!x);

  const [{ data: assessments }, { data: tasks }, { data: signed }] = ids.length
    ? await Promise.all([
        supabase.from("assessments").select("plant_id, health").in("plant_id", ids).order("created_at", { ascending: false }),
        supabase
          .from("care_tasks")
          .select("plant_id, due_at")
          .in("plant_id", ids)
          .eq("type", "water")
          .in("status", ["pending", "snoozed"])
          .order("due_at"),
        paths.length
          ? supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600)
          : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  // Both lists are sorted, so the first entry per plant is the latest check / soonest watering.
  const health = new Map<string, number | null>();
  assessments?.forEach((a) => health.has(a.plant_id) || health.set(a.plant_id, a.health));
  const water = new Map<string, string>();
  tasks?.forEach((t) => water.has(t.plant_id) || water.set(t.plant_id, t.due_at));
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const rows: PlantRow[] = (plants ?? []).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    species_name: p.species_name,
    status: p.status,
    photoUrl: urls.get(coverPath(p) ?? "") ?? null,
    health: health.get(p.id) ?? null,
    waterDue: water.get(p.id) ?? null,
  }));

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12">
      <PageHeader title="Plants" />
      {rows.length ? (
        <PlantList plants={rows} />
      ) : (
        <section className="mt-10 text-center">
          <p className="text-5xl">🌱</p>
          <h2 className="mt-4 text-xl font-semibold">No plants yet</h2>
          <p className="mt-2 text-muted">Take a photo and we&apos;ll tell you how it&apos;s doing.</p>
          <Link href="/plants/new" className="mt-6 inline-block rounded-full bg-leaf px-6 py-3 font-medium text-background">
            Add a plant
          </Link>
        </section>
      )}
    </main>
  );
}
