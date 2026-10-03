"use client";

import { useEffect, useState } from "react";

export interface Frame {
  url: string;
  date: string; // ISO
  heightCm: number | null;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Flipbook of weekly photos: autoplay, scrub, with date and estimated height. */
export function Timelapse({ frames }: { frames: Frame[] }) {
  const [index, setIndex] = useState(frames.length - 1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % frames.length), 700);
    return () => clearInterval(t);
  }, [playing, frames.length]);

  if (frames.length < 2) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        🎞️ Your growth time-lapse starts after the next weekly check-in photo.
      </div>
    );
  }

  const frame = frames[index];
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="relative aspect-[3/4] bg-leaf-soft">
        {frames.map((f, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
          <img
            key={f.url}
            src={f.url}
            alt={i === index ? `Photo from ${fmt(f.date)}` : ""}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${i === index ? "opacity-100" : "opacity-0"}`}
          />
        ))}
        <div className="absolute bottom-2 left-2 rounded-lg bg-background/90 px-2.5 py-1 text-sm">
          <span className="font-medium">{fmt(frame.date)}</span>
          {frame.heightCm != null && <span className="text-muted"> · ~{Math.round(frame.heightCm)} cm</span>}
        </div>
      </div>
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="w-20 rounded-full bg-leaf py-1.5 text-sm font-medium text-background"
          aria-label={playing ? "Pause time-lapse" : "Play time-lapse"}
        >
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
          className="flex-1 accent-[var(--leaf)]"
          aria-label="Choose a week"
        />
        <span className="w-12 text-right text-xs text-muted">
          {index + 1}/{frames.length}
        </span>
      </div>
    </div>
  );
}
