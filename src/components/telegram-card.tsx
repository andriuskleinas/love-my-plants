"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type State = "loading" | "unavailable" | "off" | "waiting" | "on";

/**
 * Connect Telegram for watering reminders. `compact` is the Today-screen prompt:
 * hidden once connected, with Settings holding the full controls.
 */
export function TelegramCard({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/messenger/link")
      .then((r) => r.json())
      .then((j) => setState(!j.available ? "unavailable" : j.connected ? "on" : "off"))
      .catch(() => setState("unavailable"));
    return () => {
      if (polling.current) clearInterval(polling.current);
    };
  }, []);

  async function connect() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/messenger/link", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage(json.error ?? "Couldn't start. Please try again.");

    window.open(json.url, "_blank", "noopener");
    setState("waiting");
    // Wait for the user to press Start in Telegram (link is valid for 15 minutes).
    let tries = 0;
    polling.current = setInterval(async () => {
      tries++;
      const status = await fetch("/api/messenger/link").then((r) => r.json()).catch(() => null);
      if (status?.connected) {
        clearInterval(polling.current!);
        setState("on");
        setMessage("Connected! Reminders will arrive in Telegram.");
      } else if (tries > 100) {
        clearInterval(polling.current!);
        setState("off");
      }
    }, 3000);
  }

  async function disconnect() {
    setBusy(true);
    await fetch("/api/messenger/link", { method: "DELETE" });
    setState("off");
    setMessage(null);
    setBusy(false);
  }

  async function sendTest() {
    setBusy(true);
    const res = await fetch("/api/messenger/test", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Sent! Check Telegram." : (json.error ?? "Couldn't send."));
    setBusy(false);
  }

  if (state === "loading" || state === "unavailable" || (compact && state === "on")) return null;

  const button = "rounded-full px-4 py-2 font-medium disabled:opacity-50";
  return (
    <div className={`rounded-2xl border border-border p-4 text-sm ${compact ? "bg-leaf-soft" : "bg-surface"}`}>
      <p className="font-semibold">✈️ Reminders in Telegram</p>
      {state === "on" && <p className="mt-1 text-muted">Connected. You&apos;ll get a message on days a plant needs water, with buttons to answer.</p>}
      {state === "off" && <p className="mt-1 text-muted">Get a message on days a plant needs water, and answer with one tap.</p>}
      {state === "waiting" && (
        <p className="mt-1 text-muted">
          Telegram should open now. Press <b>Start</b> in the chat with the bot and this will update by itself.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(state === "off" || state === "waiting") && (
          <button disabled={busy} onClick={connect} className={`${button} bg-leaf text-background`}>
            {state === "waiting" ? "Open Telegram again" : "Connect Telegram"}
          </button>
        )}
        {state === "on" && (
          <>
            <button disabled={busy} onClick={sendTest} className={`${button} bg-leaf text-background`}>
              Send a test
            </button>
            <button disabled={busy} onClick={disconnect} className={`${button} text-muted`}>
              Disconnect
            </button>
          </>
        )}
        {compact && (
          <Link href="/settings" className="px-2 text-muted">
            Other options
          </Link>
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
