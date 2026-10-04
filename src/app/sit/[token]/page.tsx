import type { Metadata } from "next";
import { TelegramCard } from "@/components/telegram-card";
import { WaterCard } from "@/components/water-card";
import { endOfLocalDay } from "@/lib/care/schedule";
import { ownerSettings, sitterPlants } from "@/lib/care/sitter.server";
import { sitterForToken } from "@/lib/circle.server";
import { dueLabel } from "@/lib/plants/format";
import { PHOTO_BUCKET } from "@/lib/plants/server";
import { createAdminClient } from "@/lib/supabase/server";
import { SitterPhotoButton } from "./photo-button";

// Private link: never indexed, never cached.
// The token is in the URL, so don't leak it via the Referer header either.
export const metadata: Metadata = {
  title: "Plant-sitting · Love My Plants",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const day = (d: Date, tz: string) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: tz });

export default async function SitterPage({ params }: PageProps<"/sit/[token]">) {
  const { token } = await params;
  const sitter = await sitterForToken(token);
  if (!sitter) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
        <p className="text-5xl">🔒</p>
        <h1 className="mt-4 text-xl font-semibold">This link no longer works</h1>
        <p className="mt-2 text-muted">Ask the plant owner to send it again.</p>
      </main>
    );
  }

  const admin = createAdminClient();
  const [{ timeZone }, plants, { data: owner }] = await Promise.all([
    ownerSettings(sitter.ownerId),
    sitterPlants(sitter),
    admin.from("profiles").select("display_name").eq("id", sitter.ownerId).maybeSingle(),
  ]);
  const ownerName = owner?.display_name ?? "your friend";

  if (sitter.status !== "active") {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
        <p className="text-5xl">{sitter.status === "upcoming" ? "🗓️" : "🌿"}</p>
        <h1 className="mt-4 text-xl font-semibold">
          {sitter.status === "upcoming" ? `Hi ${sitter.name}! Plant-sitting starts ${day(sitter.startsAt, timeZone)}` : "Plant-sitting has ended"}
        </h1>
        <p className="mt-2 text-muted">
          {sitter.status === "upcoming"
            ? `You'll look after ${plants.length} plant${plants.length === 1 ? "" : "s"} for ${ownerName} until ${day(sitter.endsAt, timeZone)}. Come back to this page then.`
            : `Thank you for looking after ${ownerName}'s plants!`}
        </p>
        {sitter.status === "upcoming" && (
          <div className="mt-8 text-left">
            <TelegramCard endpoint={`/api/sit/${token}/telegram`} sitter />
          </div>
        )}
      </main>
    );
  }

  const ids = plants.map((p) => p.id);
  const now = new Date();
  const [{ data: tasks }, { data: covers }] = await Promise.all([
    ids.length
      ? admin.from("care_tasks").select("id, plant_id, title, detail, due_at").in("plant_id", ids).eq("type", "water").in("status", ["pending", "snoozed"]).order("due_at")
      : Promise.resolve({ data: [] }),
    admin.from("photos").select("id, storage_path").in("id", plants.map((p) => p.cover_photo_id).filter(Boolean) as string[]),
  ]);
  const { data: signed } = covers?.length
    ? await admin.storage.from(PHOTO_BUCKET).createSignedUrls(covers.map((c) => c.storage_path), 3600)
    : { data: [] };
  const photoFor = (coverId: string | null) => {
    const i = covers?.findIndex((c) => c.id === coverId) ?? -1;
    return i >= 0 ? (signed?.[i]?.signedUrl ?? null) : null;
  };
  const dueBefore = endOfLocalDay(timeZone, now).getTime();
  const due = (tasks ?? []).filter((t) => new Date(t.due_at).getTime() < dueBefore);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-8">
      <p className="text-sm text-muted">🌿 Love My Plants</p>
      <h1 className="mt-1 text-2xl font-semibold">Hi {sitter.name}!</h1>
      <p className="mt-1 text-muted">
        Thanks for looking after {ownerName}&apos;s plants until {day(sitter.endsAt, timeZone)}. {ownerName} sees what you mark here.
      </p>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Today</h2>
        {due.length ? (
          <div className="mt-3 space-y-3">
            {due.map((t) => {
              const p = plants.find((x) => x.id === t.plant_id)!;
              return (
                <WaterCard
                  key={t.id}
                  taskId={t.id}
                  plantId={p.id}
                  nickname={p.nickname}
                  title={t.title}
                  detail={t.detail}
                  dueAt={t.due_at}
                  photoUrl={photoFor(p.cover_photo_id)}
                  showPlantLink={false}
                  answerEndpoint={`/api/sit/${token}/answer`}
                />
              );
            })}
          </div>
        ) : (
          <p className="mt-2 rounded-2xl bg-leaf-soft p-4">🌿 Nothing needs water today. Thank you!</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">The plants</h2>
        <ul className="mt-3 space-y-3">
          {plants.map((p) => {
            const next = (tasks ?? []).find((t) => t.plant_id === p.id);
            const species = Array.isArray(p.species) ? p.species[0] : p.species;
            const url = photoFor(p.cover_photo_id);
            return (
              <li key={p.id} className="rounded-2xl border border-border bg-surface p-3">
                <div className="flex items-center gap-3">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                    <img src={url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-leaf-soft text-2xl">🪴</div>
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="text-base font-semibold">{p.nickname}</p>
                    {next && (
                      <p className="text-muted">
                        💧 {next.title.replace(/^Water about/, "About")}, {dueLabel(new Date(next.due_at), now)}
                      </p>
                    )}
                    {species?.light && <p className="text-muted">☀️ {species.light}</p>}
                    {species?.toxic_to_pets && <p className="text-muted">🐾 Toxic to pets, keep out of reach</p>}
                  </div>
                </div>
                <SitterPhotoButton token={token} plantId={p.id} nickname={p.nickname} />
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-8">
        <TelegramCard endpoint={`/api/sit/${token}/telegram`} sitter />
      </div>
      <p className="mt-6 text-center text-xs text-muted">Something looks wrong with a plant? Send a photo and {ownerName} will see it.</p>
    </main>
  );
}
