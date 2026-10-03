"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

type State = "loading" | "unavailable" | "off" | "waiting" | "on";

/**
 * Connect Telegram for watering reminders. `compact` is the Today-screen prompt:
 * hidden once connected, with Settings holding the full controls.
 */
export function TelegramCard({
  compact = false,
  endpoint = "/api/messenger/link",
  sitter = false,
}: {
  compact?: boolean;
  /** Plant-sitters use their link's own endpoint. */
  endpoint?: string;
  sitter?: boolean;
}) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; code: string; bot: string } | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(endpoint)
      .then((r) => r.json())
      .then((j) => setState(!j.available ? "unavailable" : j.connected ? "on" : "off"))
      .catch(() => setState("unavailable"));
    return () => {
      if (polling.current) clearInterval(polling.current);
    };
  }, [endpoint]);

  async function connect() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(endpoint, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage(json.error ?? "Couldn't start. Please try again.");

    setLink(json);
    // On a computer, Telegram usually lives on the phone: show a QR code to scan.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch) window.open(json.url, "_blank", "noopener");
    else setQrSvg(await QRCode.toString(json.url, { type: "svg", margin: 1, width: 180 }));
    setState("waiting");
    if (polling.current) clearInterval(polling.current);
    // Wait for the user to press Start in Telegram (link is valid for 15 minutes).
    let tries = 0;
    polling.current = setInterval(async () => {
      tries++;
      const status = await fetch(endpoint).then((r) => r.json()).catch(() => null);
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
      {state === "on" && (
        <p className="mt-1 text-muted">
          Connected ✓ You&apos;ll get a message on days a plant needs water, with buttons to answer.
          {sitter && " You can also send /today to the bot any time."}
        </p>
      )}
      {state === "off" && <p className="mt-1 text-muted">Get a message on days a plant needs water, and answer with one tap.</p>}
      {state === "waiting" && link && (
        <div className="mt-2 space-y-2 text-muted">
          {qrSvg ? (
            <>
              <p>
                <b className="text-foreground">Scan with your phone camera</b>, open Telegram, and press <b>Start</b>.
              </p>
              <div
                className="mx-auto w-[180px] overflow-hidden rounded-xl bg-white p-1"
                aria-label="QR code that opens the bot in Telegram"
                role="img"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <p>
                Telegram on this computer?{" "}
                <a href={link.url} target="_blank" rel="noopener" className="font-medium text-leaf">
                  Open @{link.bot}
                </a>
              </p>
            </>
          ) : (
            <p>
              Telegram should open. Press <b>Start</b> in the chat with{" "}
              <a href={link.url} target="_blank" rel="noopener" className="font-medium text-leaf">
                @{link.bot}
              </a>
              .
            </p>
          )}
          <p>
            Still not connected? In Telegram, search <b className="text-foreground">@{link.bot}</b> and send it this code:
          </p>
          <p className="select-all rounded-xl bg-background py-3 text-center font-mono text-2xl font-semibold tracking-widest text-foreground">
            {link.code}
          </p>
          <p className="text-xs">The code works once and expires in 15 minutes. This card updates by itself.</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(state === "off" || state === "waiting") && (
          <button disabled={busy} onClick={connect} className={`${button} bg-leaf text-background`}>
            {state === "waiting" ? "New code" : "Connect Telegram"}
          </button>
        )}
        {state === "on" && !sitter && (
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
