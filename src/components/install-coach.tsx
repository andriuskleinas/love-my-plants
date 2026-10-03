"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

const DISMISS_KEY = "install-coach-dismissed";

/**
 * Nudges users to add the app to their home screen. On iOS this is required for push
 * reminders, and there is no install prompt API, so we show the Share → Add to Home Screen steps.
 */
export function InstallCoach() {
  const [mode, setMode] = useState<"hidden" | "ios" | "prompt">("hidden");
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (dismissed || standalone) return;

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state once on mount
    if (isIos) setMode("ios");

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as InstallPromptEvent);
      setMode("prompt");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setMode("hidden");
  };

  if (mode === "hidden") return null;

  return (
    <div className="rounded-2xl border border-border bg-leaf-soft p-4 text-sm">
      <p className="font-semibold">Add Love My Plants to your home screen</p>
      {mode === "ios" ? (
        <p className="mt-1 text-muted">
          Tap <span aria-label="Share">⎋ Share</span>, then <b>Add to Home Screen</b>. This is needed for watering reminders on iPhone.
        </p>
      ) : (
        <p className="mt-1 text-muted">It opens like an app and can send you watering reminders.</p>
      )}
      <div className="mt-3 flex gap-2">
        {mode === "prompt" && promptEvent && (
          <button
            className="rounded-full bg-leaf px-4 py-2 font-medium text-background"
            onClick={async () => {
              await promptEvent.prompt();
              dismiss();
            }}
          >
            Install
          </button>
        )}
        <button className="rounded-full px-4 py-2 text-muted" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
