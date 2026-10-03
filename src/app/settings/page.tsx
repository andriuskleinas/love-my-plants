import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NotificationsCard } from "@/components/notifications-card";
import { TelegramCard } from "@/components/telegram-card";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings · Love My Plants" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login?next=/settings");

  const { data: profile } = await supabase
    .from("profiles")
    .select("digest_time, hemisphere, timezone, location_name")
    .eq("id", userId)
    .maybeSingle();

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-6">
      <Link href="/" className="text-sm text-muted">
        ← Today
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Settings</h1>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">Reminders</h2>
      <div className="mt-2 space-y-3">
        <TelegramCard />
        <details className="rounded-2xl border border-border bg-surface text-sm">
          <summary className="cursor-pointer select-none p-4 font-medium">Prefer browser notifications?</summary>
          <div className="px-4 pb-4">
            <NotificationsCard />
          </div>
        </details>
      </div>

      <SettingsForm
        digestTime={(profile?.digest_time ?? "09:00").slice(0, 5)}
        hemisphere={(profile?.hemisphere ?? "north") as "north" | "south"}
        locationName={profile?.location_name ?? null}
        timezone={profile?.timezone ?? "UTC"}
        email={(claims?.claims?.email as string | undefined) ?? null}
      />
    </main>
  );
}
