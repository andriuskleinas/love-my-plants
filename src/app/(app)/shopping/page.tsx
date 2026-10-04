import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { loadShopping, shoppingHomeFor } from "@/lib/care/shopping.server";
import { createClient } from "@/lib/supabase/server";
import { AddItem, AddSuggestions, ItemList } from "./shopping-client";

export const metadata: Metadata = { title: "Shopping list · Love My Plants" };

export default async function ShoppingPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login?next=/shopping");
  const homeId = await shoppingHomeFor(userId);
  const { items, suggestions } = homeId ? await loadShopping(homeId) : { items: [], suggestions: [] };

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12">
      <PageHeader title="Shopping list" />
      <p className="mt-1 text-muted">
        Also in Telegram: send <b>/list</b> in the shop, or a photo of a product to check it suits your plants.
      </p>

      <ItemList items={items} />
      <AddItem />

      {suggestions.length > 0 && (
        <section className="mt-8 rounded-2xl border border-border bg-surface p-4 text-sm">
          <p className="font-semibold">💡 Coming up for your plants</p>
          <ul className="mt-2 space-y-1">
            {suggestions.map((s) => (
              <li key={s.key}>
                <b>{s.item}</b> <span className="text-muted">· {s.reason}</span>
              </li>
            ))}
          </ul>
          <AddSuggestions />
        </section>
      )}
    </main>
  );
}
