"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertIcon, CameraIcon, CloseIcon, DotsIcon, DropIcon, TrashIcon } from "@/components/icons";
import { callApi } from "@/lib/api-client";

type Props = {
  plantId: string;
  nickname: string;
  checkinDue: boolean;
  /** Watering is due today: the Water button jumps to its card. */
  waterDue: boolean;
  /** "start" when there's no rescue plan yet, "open" during one. */
  rescue: "start" | "open";
};

/** The plant page's main actions, kept within thumb reach at the bottom of the screen. */
export function PlantActions({ plantId, nickname, checkinDue, waterDue, rescue }: Props) {
  const [menu, setMenu] = useState(false);
  return (
    <>
      <div data-action-bar className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mt-10 border-t border-border bg-background/90 px-4 py-3 backdrop-blur lg:bottom-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/plants/${plantId}/checkin`}
            className="flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-leaf px-3 font-medium text-background"
          >
            <CameraIcon size={22} className="shrink-0" />
            Check in
            {checkinDue && (
              <span className="rounded-full bg-background/20 px-2 py-0.5 text-xs font-semibold">due</span>
            )}
          </Link>
          {waterDue && (
            <a
              href="#water"
              onClick={(e) => {
                const card = document.getElementById("water");
                if (!card) return;
                e.preventDefault();
                const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
                card.querySelector("button")?.focus({ preventScroll: true });
              }}
              className="flex h-12 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-leaf px-4 font-medium text-leaf"
            >
              <DropIcon size={20} className="shrink-0" />
              Water
            </a>
          )}
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label={`More for ${nickname}`}
            aria-haspopup="dialog"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted"
          >
            <DotsIcon size={22} />
          </button>
        </div>
      </div>
      <MoreSheet open={menu} onClose={() => setMenu(false)} plantId={plantId} nickname={nickname} rescue={rescue} />
    </>
  );
}

function MoreSheet({
  open,
  onClose,
  plantId,
  nickname,
  rescue,
}: {
  open: boolean;
  onClose: () => void;
  plantId: string;
  nickname: string;
  rescue: Props["rescue"];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setConfirming(false);
      setError(null);
      dialog.showModal();
      dialog.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  async function onDelete() {
    setBusy(true);
    setError(null);
    const res = await callApi(`/api/plants/${plantId}`, { method: "DELETE" });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    onClose();
    router.push("/plants");
    router.refresh();
  }

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-label={`More for ${nickname}`}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl bg-surface p-0 text-foreground outline-none backdrop:bg-black/40 lg:m-auto lg:max-w-md lg:rounded-3xl"
    >
      <div className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border lg:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-lg font-semibold">{confirming ? `Delete ${nickname}?` : nickname}</h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 rounded-full p-2 text-muted">
            <CloseIcon size={20} />
          </button>
        </div>

        {confirming ? (
          <>
            <p className="mt-2 text-muted">This removes the plant, its photos and its care history. It can&apos;t be undone.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="h-12 rounded-full border border-border font-medium disabled:opacity-50"
              >
                Keep it
              </button>
              <button onClick={onDelete} disabled={busy} className="h-12 rounded-full bg-bad font-medium text-background disabled:opacity-50">
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </>
        ) : (
          <ul className="mt-3 space-y-2">
            <li>
              <Link
                href={`/plants/${plantId}/rescue`}
                onClick={onClose}
                className="flex items-center gap-4 rounded-2xl border border-border p-4"
              >
                <AlertIcon size={28} className="shrink-0 text-terracotta" />
                <span>
                  <span className="block font-semibold">{rescue === "open" ? "Open the rescue plan" : "Something looks wrong"}</span>
                  <span className="block text-sm text-muted">
                    {rescue === "open" ? "Today's rescue steps and progress" : "Plant ER: find the cause and a rescue plan"}
                  </span>
                </span>
              </Link>
            </li>
            <li>
              <button
                onClick={() => setConfirming(true)}
                className="flex w-full items-center gap-4 rounded-2xl border border-border p-4 text-left"
              >
                <TrashIcon size={28} className="shrink-0 text-bad" />
                <span>
                  <span className="block font-semibold text-bad">Delete plant</span>
                  <span className="block text-sm text-muted">Remove it and all its photos</span>
                </span>
              </button>
            </li>
          </ul>
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
