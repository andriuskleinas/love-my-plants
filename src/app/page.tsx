import Link from "next/link";
import { InstallCoach } from "@/components/install-coach";
import { createClient } from "@/lib/supabase/server";

const isConfigured = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

type PlantRow = { id: string; nickname: string; species_name: string | null; status: string };

export default async function Home() {
  if (!isConfigured()) return <Landing />;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return <Landing />;

  const { data: plants } = await supabase
    .from("plants")
    .select("id, nickname, species_name, status")
    .neq("status", "archived")
    .order("created_at");

  return <Today plants={plants ?? []} />;
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
          {plants.map((p) => (
            <li key={p.id} className="rounded-2xl border border-border bg-surface p-4">
              <p className="font-semibold">
                {p.status === "er" && "🚨 "}
                {p.nickname}
              </p>
              {p.species_name && <p className="text-sm text-muted">{p.species_name}</p>}
            </li>
          ))}
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
