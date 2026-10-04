"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertIcon, BackIcon, CameraIcon, CloseIcon, SproutIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";

type Mode = "menu" | "checkin" | "rescue";
type PlantOption = { id: string; nickname: string; species_name: string | null };

const PICK_TITLE: Record<Exclude<Mode, "menu">, string> = {
  checkin: "Which plant are you checking in?",
  rescue: "Which plant looks wrong?",
};

/** The ＋ action: add a plant, or pick one to check in or rescue. A native <dialog> handles focus and Esc. */
export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("menu");
  const [plants, setPlants] = useState<PlantOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setMode("menu");
      dialog.showModal();
      // Focus the sheet, not the close button, so a tap doesn't leave a focus ring on ✕.
      dialog.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  async function pick(next: Exclude<Mode, "menu">) {
    setError(null);
    let list = plants;
    if (!list) {
      const { data, error } = await createClient()
        .from("plants")
        .select("id, nickname, species_name")
        .neq("status", "archived")
        .order("created_at");
      if (error) {
        setError("Couldn't load your plants. Check your connection and try again.");
        return;
      }
      list = data;
      setPlants(list);
    }
    // One plant: no need to ask which.
    if (list.length === 1) return go(`/plants/${list[0].id}/${next}`);
    setMode(next);
  }

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-label="Add or check a plant"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl bg-surface p-0 text-foreground outline-none backdrop:bg-black/40 lg:m-auto lg:max-w-md lg:rounded-3xl"
    >
      <div className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border lg:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-2">
          {mode === "menu" ? (
            <h2 className="text-lg font-semibold">What would you like to do?</h2>
          ) : (
            <button onClick={() => setMode("menu")} className="-ml-2 flex items-center gap-1 rounded-full p-2 text-sm text-muted">
              <BackIcon size={18} /> Back
            </button>
          )}
          <button onClick={onClose} aria-label="Close" className="-mr-2 rounded-full p-2 text-muted">
            <CloseIcon size={20} />
          </button>
        </div>

        {mode === "menu" ? (
          <ul className="mt-3 space-y-2">
            <li>
              <Link
                href="/plants/new"
                onClick={onClose}
                className="flex items-center gap-4 rounded-2xl bg-leaf p-4 text-background"
              >
                <SproutIcon size={28} />
                <span>
                  <span className="block font-semibold">Add a new plant</span>
                  <span className="block text-sm opacity-85">Take a photo and get a health check</span>
                </span>
              </Link>
            </li>
            <li>
              <button onClick={() => pick("checkin")} className="flex w-full items-center gap-4 rounded-2xl border border-border p-4 text-left">
                <CameraIcon size={28} className="text-leaf" />
                <span>
                  <span className="block font-semibold">Check in a plant</span>
                  <span className="block text-sm text-muted">A new photo updates its health and growth</span>
                </span>
              </button>
            </li>
            <li>
              <button onClick={() => pick("rescue")} className="flex w-full items-center gap-4 rounded-2xl border border-border p-4 text-left">
                <AlertIcon size={28} className="text-terracotta" />
                <span>
                  <span className="block font-semibold">Something looks wrong</span>
                  <span className="block text-sm text-muted">Plant ER: find the cause and a rescue plan</span>
                </span>
              </button>
            </li>
          </ul>
        ) : (
          <>
            <h2 className="mt-1 text-lg font-semibold">{PICK_TITLE[mode]}</h2>
            {plants?.length ? (
              <ul className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">
                {plants.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => go(`/plants/${p.id}/${mode}`)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-border p-3 text-left"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-leaf-soft text-lg" aria-hidden>
                        🪴
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.nickname}</span>
                        {p.species_name && <span className="block truncate text-sm italic text-muted">{p.species_name}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-2xl bg-leaf-soft p-4 text-sm">
                You haven&apos;t added any plants yet.{" "}
                <Link href="/plants/new" onClick={onClose} className="font-medium underline">
                  Add your first plant
                </Link>
              </p>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
