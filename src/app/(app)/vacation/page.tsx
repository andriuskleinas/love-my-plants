import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { PREP_WHEN_LABELS, type PrepWhen } from "@/lib/care/vacation";
import { loadTrip } from "@/lib/care/vacation.server";
import { createClient } from "@/lib/supabase/server";
import { CancelTrip, PrepList, TripForm } from "./vacation-client";

export const metadata: Metadata = { title: "Vacation · Love My Plants" };

const WHEN_ORDER: PrepWhen[] = ["week_before", "day_before", "leaving", "return"];
const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long" });
const ymd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default async function VacationPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login?next=/vacation");
  const trip = await loadTrip(supabase, userId);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 lg:max-w-2xl">
      <PageHeader title="Going away" back={{ href: "/more", label: "More" }} />

      {!trip ? (
        <>
          <p className="mt-1 text-muted">Tell us your dates and we&apos;ll make a simple prep list for each plant, based on how long you&apos;re away.</p>
          <TripForm />
        </>
      ) : (
        <>
          <div className="mt-4 rounded-2xl bg-leaf-soft p-4">
            <p className="font-semibold">
              {fmt(trip.startsAt)} – {fmt(trip.endsAt)} · {trip.days} day{trip.days > 1 ? "s" : ""}
            </p>
            <p className="mt-1 text-sm text-muted">
              {trip.status === "active"
                ? "You're away. Your reminders are paused until you're back."
                : "Your own reminders pause while you're away."}
            </p>
          </div>

          <section className="mt-6 rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="font-semibold">🧳 Plant-sitter</p>
            {trip.sitters.length ? (
              <p className="mt-1 text-muted">
                {trip.sitters.map((s) => `${s.name} (${s.plants} plant${s.plants === 1 ? "" : "s"})`).join(", ")} will look after
                plants during your trip and gets the reminders. You&apos;ll hear when they water.
              </p>
            ) : (
              <>
                <p className="mt-1 text-muted">Nobody is looking after your plants yet. A neighbour or friend can, with just a link, no app needed.</p>
                <Link
                  href={`/circle?role=sitter&from=${ymd(trip.startsAt)}&to=${ymd(trip.endsAt)}`}
                  className="mt-3 inline-block rounded-full bg-leaf px-4 py-2 font-medium text-background"
                >
                  Invite a plant-sitter for these dates
                </Link>
              </>
            )}
          </section>

          <h2 className="mt-8 text-lg font-semibold">Prep checklist</h2>
          {WHEN_ORDER.map((when) => {
            const items = trip.items.filter((i) => i.when === when);
            if (!items.length) return null;
            return (
              <section key={when} className="mt-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{PREP_WHEN_LABELS[when]}</h3>
                <div className="mt-2">
                  <PrepList tripId={trip.id} items={items.map((i) => ({ key: i.key, text: i.text, done: i.done }))} />
                </div>
              </section>
            );
          })}

          <CancelTrip tripId={trip.id} />
        </>
      )}
    </main>
  );
}
