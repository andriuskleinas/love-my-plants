import Link from "next/link";
import { InstallCoach } from "@/components/install-coach";
import { HealthBadge } from "@/components/report-card";
import { dueLabel, isDue } from "@/lib/plants/format";
import { PHOTO_BUCKET } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

const isConfigured = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

type PlantRow = {
  id: string;
  nickname: string;
  species_name: string | null;
  status: string;
  photoUrl: string | null;
  health: number | null;
  waterDue: string | null;
};

export default async function Home() {
  if (!isConfigured()) return <Landing />;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return <Landing />;

  const { data: plants } = await supabase
    .from("plants")
    .select("id, nickname, species_name, status, cover:photos!plants_cover_photo_fk(storage_path)")
    .neq("status", "archived")
    .order("created_at");
  if (!plants?.length) return <Today plants={[]} />;

  const ids = plants.map((p) => p.id);
  const coverPath = (p: (typeof plants)[number]) =>
    (Array.isArray(p.cover) ? p.cover[0] : p.cover)?.storage_path as string | undefined;
  const paths = plants.map(coverPath).filter((x): x is string => !!x);

  const [{ data: assessments }, { data: tasks }, { data: signed }] = await Promise.all([
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
  ]);

  // Both lists are sorted, so the first entry per plant is the latest check / soonest watering.
  const firstBy = <T extends { plant_id: string }>(rows: T[] | null) => {
    const map = new Map<string, T>();
    rows?.forEach((r) => map.has(r.plant_id) || map.set(r.plant_id, r));
    return map;
  };
  const health = firstBy(assessments);
  const water = firstBy(tasks);
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <Today
      plants={plants.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        species_name: p.species_name,
        status: p.status,
        photoUrl: urls.get(coverPath(p) ?? "") ?? null,
        health: health.get(p.id)?.health ?? null,
        waterDue: water.get(p.id)?.due_at ?? null,
      }))}
    />
  );
}

function Landing() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <p className="text-5xl">🪴</p>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Snap a photo. Know what your plant needs.</h1>
      <p className="mt-3 text-lg text-muted">
        A health check for every plant, three simple steps for today, and a nudge when it&apos;s thirsty.
      </p>
      <ul className="mt-8 space-y-3 text-base">
        <li className="flex gap-3"><span aria-hidden>📷</span><span>Photo health check: leaves, soil, light, pot and pests</span></li>
        <li className="flex gap-3"><span aria-hidden>💧</span><span>Watering reminders that learn from your plant</span></li>
        <li className="flex gap-3"><span aria-hidden>🪴</span><span>A repot plan as it grows, plus a growth time-lapse</span></li>
        <li className="flex gap-3"><span aria-hidden>🚨</span><span>Rescue plans when something goes wrong</span></li>
        <li className="flex gap-3"><span aria-hidden>✈️</span><span>Vacation prep and a simple link for your plant-sitter</span></li>
      </ul>
      <Link href="/login" className="mt-10 rounded-full bg-leaf py-3 text-center font-medium text-background">
        Get started
      </Link>
    </main>
  );
}

function Today({ plants }: { plants: PlantRow[] }) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-8">
      <h1 className="text-2xl font-semibold">Today</h1>
      <div className="mt-4">
        <InstallCoach />
      </div>

      {plants.length === 0 ? (
        <section className="mt-10 text-center">
          <p className="text-5xl">🌱</p>
          <h2 className="mt-4 text-xl font-semibold">Add your first plant</h2>
          <p className="mt-2 text-muted">Take a photo and we&apos;ll tell you how it&apos;s doing.</p>
        </section>
      ) : (
        <ul className="mt-6 space-y-3">
          {plants.map((p) => {
            const due = p.waterDue ? new Date(p.waterDue) : null;
            const thirsty = due != null && isDue(due);
            return (
              <li key={p.id}>
                <Link
                  href={`/plants/${p.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-3"
                >
                  {p.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                    <img src={p.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-leaf-soft text-2xl">🪴</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {p.status === "er" && "🚨 "}
                      {p.nickname}
                    </p>
                    {p.species_name && <p className="truncate text-sm italic text-muted">{p.species_name}</p>}
                    {due && (
                      <p className={`mt-0.5 text-sm ${thirsty ? "font-medium text-terracotta" : "text-muted"}`}>
                        💧 {thirsty ? "Needs water" : "Water"} {dueLabel(due)}
                      </p>
                    )}
                  </div>
                  {p.health != null && <HealthBadge value={p.health} />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href="/plants/new"
        aria-label="Add a plant"
        className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full bg-leaf text-3xl text-background shadow-lg"
      >
        📷
      </Link>
    </main>
  );
}
