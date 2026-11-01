"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CameraIcon, CloseIcon, ScissorsIcon } from "@/components/icons";
import { PlantPicture } from "@/components/plant-picture";
import { callApi } from "@/lib/api-client";
import { readPhoto, uploadPlantPhoto } from "@/lib/image/upload";
import { creditLine, type PhotoCredit } from "@/lib/plants/stock-photos";
import { createClient } from "@/lib/supabase/client";

export type PicturePhoto = { id: string; url: string; kind: string };
type Candidate = { file: string; preview: string; credit: PhotoCredit };

type Props = {
  open: boolean;
  onClose: () => void;
  plantId: string;
  homeId: string;
  nickname: string;
  speciesName: string | null;
  /** Newest first. */
  photos: PicturePhoto[];
  currentId: string | null;
  /** The owner picked the picture; check-ins don't replace it. */
  pinned: boolean;
  /** The current picture is the owner's own photo and background removal is set up. */
  canCutOut: boolean;
};

/** Choose the plant's picture: one of its photos, a new photo, or a species photo from Wikimedia Commons. */
export function PictureSheet({ open, onClose, plantId, homeId, nickname, speciesName, photos, currentId, pinned, canCutOut }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  /** What's being saved: a photo id, a Commons file, "upload", "cutout", "auto" or "search". */
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setError(null);
      setBusy(null);
      dialog.showModal();
      dialog.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  async function choose(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    const res = await callApi(`/api/plants/${plantId}/cover`, { method: "POST", json: body });
    if (!res.ok) {
      setError(res.error);
      setBusy(null);
      return;
    }
    router.refresh();
    onClose();
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy("upload");
    setError(null);
    try {
      const blob = await readPhoto(file);
      const path = `${homeId}/${plantId}/${crypto.randomUUID()}.jpg`;
      await uploadPlantPhoto(createClient(), path, blob);
      await choose("upload", { path });
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function search() {
    setBusy("search");
    setError(null);
    const res = await callApi<{ candidates: Candidate[] }>(`/api/plants/${plantId}/cover`);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setCandidates(res.data.candidates);
  }

  const tile = (selected: boolean) =>
    `relative block aspect-square w-full overflow-hidden rounded-xl bg-leaf-soft disabled:opacity-60 ${
      selected ? "ring-[3px] ring-leaf ring-offset-2 ring-offset-surface" : ""
    }`;

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-label={`Picture for ${nickname}`}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none rounded-t-3xl bg-surface p-0 text-foreground outline-none backdrop:bg-black/40 lg:m-auto lg:max-w-md lg:rounded-3xl"
    >
      <div className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border lg:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-lg font-semibold">Picture for {nickname}</h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 rounded-full p-2 text-muted">
            <CloseIcon size={20} />
          </button>
        </div>

        {canCutOut && currentId && (
          <button
            onClick={() => choose("cutout", { cutoutOf: currentId })}
            disabled={!!busy}
            className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-leaf bg-leaf-soft p-4 text-left disabled:opacity-60"
          >
            <ScissorsIcon size={28} className="shrink-0 text-leaf" />
            <span>
              <span className="block font-semibold">{busy === "cutout" ? "Removing the background…" : "Remove the background"}</span>
              <span className="block text-sm text-muted">Shows just your plant on a clean backdrop, like a catalog photo</span>
            </span>
          </button>
        )}

        <label
          className={`mt-3 flex cursor-pointer items-center gap-4 rounded-2xl border border-border p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-leaf ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <CameraIcon size={28} className="shrink-0 text-leaf" />
          <span>
            <span className="block font-semibold">{busy === "upload" ? "Saving…" : "Take or upload a photo"}</span>
            <span className="block text-sm text-muted">Use the camera or pick one from your phone</span>
          </span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={!!busy}
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>

        {photos.length > 0 && (
          <section className="mt-5" aria-labelledby="your-photos">
            <h3 id="your-photos" className="text-sm font-medium text-muted">
              Your photos
            </h3>
            <ul className="mt-2 grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => p.id !== currentId && choose(p.id, { photoId: p.id })}
                    disabled={!!busy}
                    aria-pressed={p.id === currentId}
                    aria-label={p.id === currentId ? "Current picture" : "Use this photo"}
                    className={tile(p.id === currentId)}
                  >
                    <PlantPicture url={p.url} className="h-full w-full" />
                    {busy === p.id && <Saving />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {speciesName && (
          <section className="mt-5" aria-labelledby="pro-photos">
            <h3 id="pro-photos" className="text-sm font-medium text-muted">
              Professional photos
            </h3>
            {candidates === null ? (
              <button
                onClick={search}
                disabled={!!busy}
                className="mt-2 w-full rounded-2xl border border-border p-4 text-left disabled:opacity-60"
              >
                <span className="block font-semibold">{busy === "search" ? "Looking…" : `Show photos of ${speciesName.replace(/\s*\(.*?\)/g, "")}`}</span>
                <span className="block text-sm text-muted">Free photos from Wikimedia Commons, with the photographer&apos;s credit</span>
              </button>
            ) : candidates.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No photos of this species were found. Pick one of your own photos instead.</p>
            ) : (
              <ul className="mt-2 grid grid-cols-2 gap-3">
                {candidates.map((c) => (
                  <li key={c.file}>
                    <button onClick={() => choose(c.file, { stockFile: c.file })} disabled={!!busy} aria-label="Use this photo" className={tile(false)}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- inline preview from our server */}
                      <img src={c.preview} alt="" className="h-full w-full object-cover" />
                      {busy === c.file && <Saving />}
                    </button>
                    <p className="mt-1 truncate text-xs text-muted" title={creditLine(c.credit)}>
                      {creditLine(c.credit)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {pinned && (
          <button
            onClick={() => choose("auto", { auto: true })}
            disabled={!!busy}
            className="mt-5 py-1 text-sm text-muted underline-offset-2 hover:underline disabled:opacity-60"
          >
            {busy === "auto" ? "Saving…" : "Always show the newest check-in photo instead"}
          </button>
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

function Saving() {
  return (
    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-medium text-white" role="status">
      Saving…
    </span>
  );
}
