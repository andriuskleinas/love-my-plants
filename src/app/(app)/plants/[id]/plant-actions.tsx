"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertIcon, CameraIcon, CloseIcon, DotsIcon, DropIcon, ImageIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { callApi } from "@/lib/api-client";
import type { LogType } from "@/lib/care/log";
import { LogCareSheet, useLogCareRequests } from "@/components/log-care-sheet";
import { PictureSheet, type PicturePhoto } from "./picture-sheet";

const OPEN_EVENT = "plant:open-sheet";
type SheetRequest = "rename" | "picture";

/** A button in the server-rendered page that opens the rename form or the picture chooser. */
export function OpenSheetButton({ sheet, className, children, ...rest }: { sheet: SheetRequest } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: sheet }))}
      className={className}
      {...rest}
    >
      {children}
    </button>
  );
}

type Props = {
  plantId: string;
  nickname: string;
  potCm: number;
  checkinDue: boolean;
  /** Watering is due today: the Water button jumps to its card. */
  waterDue: boolean;
  /** "start" when there's no rescue plan yet, "open" during one. */
  rescue: "start" | "open";
  picture: {
    homeId: string;
    speciesName: string | null;
    photos: PicturePhoto[];
    currentId: string | null;
    pinned: boolean;
    canCutOut: boolean;
  };
};

/** The plant page's main actions, kept within thumb reach at the bottom of the screen. */
export function PlantActions({ plantId, nickname, potCm, checkinDue, waterDue, rescue, picture }: Props) {
  const [menu, setMenu] = useState<MenuMode | null>(null);
  const [pictureOpen, setPictureOpen] = useState(false);
  const [log, setLog] = useState<{ type: LogType | null } | null>(null);
  const openLog = (type: LogType | null) => {
    setMenu(null);
    setLog({ type });
  };
  const openPicture = () => {
    setMenu(null);
    setPictureOpen(true);
  };
  useLogCareRequests(openLog);
  useEffect(() => {
    const listener = (e: Event) => ((e as CustomEvent<SheetRequest>).detail === "picture" ? openPicture() : setMenu("rename"));
    window.addEventListener(OPEN_EVENT, listener);
    return () => window.removeEventListener(OPEN_EVENT, listener);
  }, []);
  const plants = useMemo(() => [{ id: plantId, nickname, potCm }], [plantId, nickname, potCm]);
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
          {!waterDue && (
            <button
              type="button"
              onClick={() => openLog(null)}
              aria-haspopup="dialog"
              className="flex h-12 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-leaf px-4 font-medium text-leaf"
            >
              <PlusIcon size={20} className="shrink-0" />
              Log care
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenu("menu")}
            aria-label={`More for ${nickname}`}
            aria-haspopup="dialog"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted"
          >
            <DotsIcon size={22} />
          </button>
        </div>
      </div>
      <MoreSheet
        mode={menu}
        onMode={setMenu}
        onClose={() => setMenu(null)}
        onLog={() => openLog(null)}
        onPicture={openPicture}
        plantId={plantId}
        nickname={nickname}
        rescue={rescue}
      />
      <PictureSheet open={pictureOpen} onClose={() => setPictureOpen(false)} plantId={plantId} nickname={nickname} {...picture} />
      <LogCareSheet
        open={!!log}
        initialType={log?.type ?? null}
        onClose={() => setLog(null)}
        plants={plants}
      />
    </>
  );
}

type MenuMode = "menu" | "rename" | "delete";

function MoreSheet({
  mode,
  onMode,
  onClose,
  onLog,
  onPicture,
  plantId,
  nickname,
  rescue,
}: {
  mode: MenuMode | null;
  onMode: (mode: MenuMode) => void;
  onClose: () => void;
  onLog: () => void;
  onPicture: () => void;
  plantId: string;
  nickname: string;
  rescue: Props["rescue"];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(nickname);
  const open = mode !== null;
  const confirming = mode === "delete";

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setError(null);
      setName(nickname);
      dialog.showModal();
      dialog.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open, nickname]);

  async function onRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("The name is empty. Type a name for your plant.");
    setBusy(true);
    setError(null);
    const res = await callApi(`/api/plants/${plantId}`, { method: "PATCH", json: { nickname: trimmed } });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onClose();
    router.refresh();
  }

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
          <h2 className="truncate text-lg font-semibold">
            {confirming ? `Delete ${nickname}?` : mode === "rename" ? `Rename ${nickname}` : nickname}
          </h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 rounded-full p-2 text-muted">
            <CloseIcon size={20} />
          </button>
        </div>

        {mode === "rename" ? (
          <form onSubmit={onRename} className="mt-3">
            <label htmlFor="plant-name" className="block text-sm text-muted">
              Name
            </label>
            <input
              id="plant-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="off"
              autoFocus
              enterKeyHint="done"
              className="mt-1 h-12 w-full rounded-xl border border-border bg-background px-3 text-base"
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="h-12 rounded-full border border-border font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button type="submit" disabled={busy} className="h-12 rounded-full bg-leaf font-medium text-background disabled:opacity-50">
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        ) : confirming ? (
          <>
            <p className="mt-2 text-muted">This removes the plant, its photos and its care history. It can&apos;t be undone.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() => onMode("menu")}
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
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => onMode("rename")} className="flex items-center gap-3 rounded-2xl border border-border p-4 text-left font-semibold">
                  <PencilIcon size={24} className="shrink-0 text-leaf" />
                  Rename
                </button>
                <button onClick={onPicture} className="flex items-center gap-3 rounded-2xl border border-border p-4 text-left font-semibold">
                  <ImageIcon size={24} className="shrink-0 text-leaf" />
                  Change picture
                </button>
              </div>
            </li>
            <li>
              <button onClick={onLog} className="flex w-full items-center gap-4 rounded-2xl border border-border p-4 text-left">
                <PlusIcon size={28} className="shrink-0 text-leaf" />
                <span>
                  <span className="block font-semibold">Log care</span>
                  <span className="block text-sm text-muted">Watered, fed, pruned… without a reminder</span>
                </span>
              </button>
            </li>
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
                onClick={() => onMode("delete")}
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
