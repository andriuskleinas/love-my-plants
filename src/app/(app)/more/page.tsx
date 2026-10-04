import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ComponentType } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { ChevronIcon, GearIcon, PeopleIcon, SuitcaseIcon } from "@/components/icons";
import { SignOutButton } from "@/components/sign-out-button";
import { loadTrip } from "@/lib/care/vacation.server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "More · Love My Plants" };

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default async function MorePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login?next=/more");

  const [trip, { data: members }, { data: profile }] = await Promise.all([
    loadTrip(supabase, userId),
    supabase.from("home_members").select("user_id, role"),
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
  ]);
  const helpers = (members ?? []).filter((m) => m.user_id !== userId).length;
  const email = (claims?.claims?.email as string | undefined) ?? null;

  const links: { href: string; label: string; status: string; icon: ComponentType<{ size?: number }> }[] = [
    {
      href: "/vacation",
      label: "Going away",
      icon: SuitcaseIcon,
      status: !trip
        ? "Plan ahead so your plants are fine while you're away"
        : trip.status === "active"
          ? `Away until ${fmt(trip.endsAt)} · reminders paused`
          : `Trip ${fmt(trip.startsAt)} – ${fmt(trip.endsAt)}`,
    },
    {
      href: "/circle",
      label: "Care Circle",
      icon: PeopleIcon,
      status: helpers ? `${helpers} ${helpers === 1 ? "person helps" : "people help"} with your plants` : "Invite family or a plant-sitter",
    },
    { href: "/settings", label: "Settings", icon: GearIcon, status: "Reminders, your name, location" },
  ];

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12">
      <PageHeader title="More" />
      <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {links.map(({ href, label, status, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-4 p-4 hover:bg-background">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-leaf-soft text-leaf">
                <Icon size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{label}</span>
                <span className="block truncate text-sm text-muted">{status}</span>
              </span>
              <ChevronIcon size={18} className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-8 rounded-2xl border border-border bg-surface p-4 text-sm" aria-label="Account">
        <p className="font-semibold">{profile?.display_name || "Your account"}</p>
        {email && <p className="mt-0.5 text-muted">{email}</p>}
        <SignOutButton className="mt-3 font-medium text-bad" />
      </section>
    </main>
  );
}
