"use client";

import { useEffect, useState } from "react";

type State = "loading" | "unsupported" | "needs-install" | "off" | "on" | "blocked";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Turns watering reminders on/off for this device. `compact` hides itself once on
 * (for the Today screen); the full version lives in Settings with a test button.
 */
export function NotificationsCard({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      let next: State;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        next = isIos && !standalone ? "needs-install" : "unsupported";
      } else if (Notification.permission === "denied") {
        next = "blocked";
      } else {
        const reg = await navigator.serviceWorker.ready;
        next = (await reg.pushManager.getSubscription()) ? "on" : "off";
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!res.ok) throw new Error();
      setState("on");
    } catch {
      setMessage("Couldn't turn on reminders. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    setState("off");
    setBusy(false);
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/push/test", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Sent! It should appear in a few seconds." : (json.error ?? "Couldn't send."));
    setBusy(false);
  }

  if (state === "loading" || (compact && (state === "on" || state === "unsupported"))) return null;

  const button = "rounded-full px-4 py-2 font-medium disabled:opacity-50";

  return (
    <div className={`rounded-2xl border border-border p-4 text-sm ${compact ? "bg-leaf-soft" : "bg-surface"}`}>
      <p className="font-semibold">💧 Watering reminders</p>
      {state === "on" && <p className="mt-1 text-muted">On for this device. You&apos;ll get one message on days a plant needs water.</p>}
      {state === "off" && <p className="mt-1 text-muted">Get one short message on days a plant needs water.</p>}
      {state === "blocked" && (
        <p className="mt-1 text-muted">
          Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload.
        </p>
      )}
      {state === "needs-install" && (
        <p className="mt-1 text-muted">
          On iPhone, first add the app to your home screen (Share → Add to Home Screen), then open it from there.
        </p>
      )}
      {state === "unsupported" && <p className="mt-1 text-muted">This browser can&apos;t show reminders. Try Chrome, Edge, Firefox or Safari.</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {state === "off" && (
          <button disabled={busy} onClick={turnOn} className={`${button} bg-leaf text-background`}>
            Turn on reminders
          </button>
        )}
        {state === "on" && !compact && (
          <>
            <button disabled={busy} onClick={sendTest} className={`${button} bg-leaf text-background`}>
              Send a test
            </button>
            <button disabled={busy} onClick={turnOff} className={`${button} text-muted`}>
              Turn off
            </button>
          </>
        )}
      </div>
      {message && (
        <p role="status" className="mt-2 text-muted">
          {message}
        </p>
      )}
    </div>
  );
}
