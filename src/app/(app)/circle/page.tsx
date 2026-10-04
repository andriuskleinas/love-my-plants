import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { isMemberActive } from "@/lib/care/access";
import { getManagedHomeId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";
import { CircleMembers, InviteForm } from "./circle-client";

export const metadata: Metadata = { title: "Care Circle · Love My Plants" };

export default async function CirclePage({ searchParams }: PageProps<"/circle">) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login?next=/circle");
  const homeId = await getManagedHomeId(supabase, userId);
  const sp = await searchParams;

  const [{ data: members }, { data: plants }, { data: me }] = await Promise.all([
    supabase
      .from("home_members")
      .select("id, user_id, display_name, role, accepted_at, starts_at, ends_at, plant_scope")
      .eq("home_id", homeId)
      .order("created_at"),
    supabase.from("plants").select("id, nickname").eq("home_id", homeId).neq("status", "archived").order("created_at"),
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
  ]);
  // The default name comes from the email address; ask for a real one before inviting.
  const email = (claims?.claims?.email as string | undefined) ?? "";
  const nameFromEmail = !me?.display_name || me.display_name === email.split("@")[0];
  const now = new Date();
  const rows = (members ?? []).map((m) => ({
    id: m.id,
    name: m.display_name,
    role: m.role as "owner" | "household" | "sitter",
    isMe: m.user_id === userId,
    pending: m.role === "household" && !m.user_id,
    startsAt: m.starts_at,
    endsAt: m.ends_at,
    sitterStatus:
      m.role !== "sitter"
        ? null
        : now < new Date(m.starts_at!)
          ? ("upcoming" as const)
          : isMemberActive({ role: "sitter", startsAt: new Date(m.starts_at!), endsAt: new Date(m.ends_at!) }, now)
            ? ("active" as const)
            : ("ended" as const),
    plants: (m.plant_scope ?? []).map((id: string) => plants?.find((p) => p.id === id)?.nickname).filter(Boolean) as string[],
  }));

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12">
      <PageHeader title="Care Circle" back={{ href: "/more", label: "More" }} />
      <p className="mt-1 text-muted">Everyone who helps look after your plants. Whoever waters taps Done, and the others don&apos;t get that reminder.</p>

      {nameFromEmail && (
        <Link href="/settings" className="mt-4 block rounded-2xl bg-warn/15 p-3 text-sm">
          👋 People you invite will see you as <b>&quot;{me?.display_name}&quot;</b>. <span className="underline">Set your name</span> first?
        </Link>
      )}
      <CircleMembers members={rows} />
      <InviteForm
        plants={plants ?? []}
        initial={{
          role: sp.role === "sitter" ? "sitter" : undefined,
          from: typeof sp.from === "string" ? sp.from : undefined,
          to: typeof sp.to === "string" ? sp.to : undefined,
        }}
      />
    </main>
  );
}
