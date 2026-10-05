"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CloseIcon } from "@/components/icons";

/** How long Undo stays available before the change is saved. */
export const UNDO_MS = 5000;
const SHOW_MS = 4000;

type RunResult = { ok: true; message?: string } | { ok: false; error: string };

export type DeferredAction = {
  /** Shown straight away, next to Undo. */
  message: string;
  /** Saves the change. Called after UNDO_MS, or sooner when the page is hidden or another action starts. */
  run: () => Promise<RunResult>;
  onUndo: () => void;
  onError: (error: string) => void;
};

type Pending = DeferredAction & { id: number; timer: ReturnType<typeof setTimeout> };
type Shown = { id: number; message: string; undoable: boolean; error?: boolean };

type ToastApi = {
  /** Shows "message · Undo" and saves later. Returns cancel(), which undoes it if it hasn't been saved yet. */
  defer: (action: DeferredAction) => () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Null outside the signed-in app (e.g. the plant-sitter page): callers then save straight away. */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const pending = useRef<Pending | null>(null);
  const nextId = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((toast: Shown, hideAfter?: number) => {
    clearTimeout(hideTimer.current);
    setShown(toast);
    if (hideAfter) hideTimer.current = setTimeout(() => setShown((s) => (s?.id === toast.id ? null : s)), hideAfter);
  }, []);

  const commit = useCallback(
    async (p: Pending) => {
      clearTimeout(p.timer);
      if (pending.current?.id === p.id) pending.current = null;
      setShown((s) => (s?.id === p.id ? { ...s, undoable: false } : s));
      const result = await p.run();
      if (!result.ok) p.onError(result.error);
      // A newer change is waiting for its Undo: leave its toast alone.
      if (pending.current && pending.current.id !== p.id) return;
      if (!result.ok) show({ id: p.id, message: result.error, undoable: false, error: true }, SHOW_MS * 2);
      else if (result.message) show({ id: p.id, message: result.message, undoable: false }, SHOW_MS);
      else setShown((s) => (s?.id === p.id ? null : s));
    },
    [show],
  );

  const undo = useCallback((id: number) => {
    const p = pending.current;
    if (!p || p.id !== id) return false;
    clearTimeout(p.timer);
    pending.current = null;
    p.onUndo();
    setShown((s) => (s?.id === id ? null : s));
    return true;
  }, []);

  const defer = useCallback(
    (action: DeferredAction) => {
      // One undo at a time: save the previous change before offering a new one.
      if (pending.current) void commit(pending.current);
      const id = ++nextId.current;
      const p: Pending = { ...action, id, timer: setTimeout(() => void commit(p), UNDO_MS) };
      pending.current = p;
      show({ id, message: action.message, undoable: true });
      return () => void undo(id);
    },
    [commit, show, undo],
  );

  // Leaving or hiding the app saves straight away, so a change is never lost.
  useEffect(() => {
    const flush = () => pending.current && void commit(pending.current);
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [commit]);

  return (
    <ToastContext.Provider value={{ defer }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="toast-dock pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 lg:left-72"
      >
        {shown && (
          <div
            key={shown.id}
            className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl py-2 pl-4 pr-2 shadow-lg motion-safe:animate-[toast-in_180ms_ease-out] ${
              shown.error ? "bg-bad text-background" : "bg-foreground text-background"
            }`}
          >
            <p className="min-w-0 flex-1 py-1.5 text-sm">{shown.message}</p>
            {shown.undoable ? (
              <button
                type="button"
                onClick={() => undo(shown.id)}
                className="h-10 shrink-0 rounded-full px-4 text-sm font-semibold text-leaf-soft underline-offset-2 hover:underline"
              >
                Undo
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShown(null)}
                aria-label="Dismiss"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full opacity-80 hover:opacity-100"
              >
                <CloseIcon size={18} />
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
