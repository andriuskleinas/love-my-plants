import { AppShell } from "@/components/app-shell/app-shell";
import { createClient } from "@/lib/supabase/server";

const isConfigured = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Signed-in pages get the navigation; signed-out visitors to "/" see the landing page without it. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!isConfigured()) return children;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return children;
  return <AppShell>{children}</AppShell>;
}
