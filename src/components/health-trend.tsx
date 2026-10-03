"use client";

import { useState } from "react";

export interface TrendPoint {
  date: string; // ISO
  health: number;
  heightCm: number | null;
}

const W = 320;
const H = 150;
const PAD = { top: 12, right: 14, bottom: 24, left: 30 };
const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * Overall health over time: one series, 2px line, 8px markers with a surface ring,
 * hairline grid, hover/focus tooltip, and a table view. One check → a stat, not a chart.
 */
export function HealthTrend({ points }: { points: TrendPoint[] }) {
  const [active, setActive] = useState<number | null>(null);

  if (points.length < 2) {
    const p = points[0];
    return (
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">Health</p>
        <p className="text-3xl font-semibold">{p ? p.health : "–"}</p>
        <p className="mt-1 text-sm text-muted">
          {p ? `First check on ${fmt(p.date)}. ` : ""}Your trend appears after the next weekly check-in.
        </p>
      </div>
    );
  }

  const t0 = new Date(points[0].date).getTime();
  const t1 = new Date(points.at(-1)!.date).getTime();
  const x = (iso: string) => PAD.left + ((new Date(iso).getTime() - t0) / Math.max(t1 - t0, 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / 100) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.health).toFixed(1)}`).join(" ");
  const last = points.at(-1)!;
  const change = last.health - points[0].health;
  const a = active != null ? points[active] : null;

  function nearest(clientX: number, rect: DOMRect) {
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(points[best].date) - px)) best = i;
    });
    setActive(best);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted">Health over {points.length} checks</p>
        <p className="text-sm">
          <span className="font-semibold">{last.health}</span>{" "}
          <span className="text-muted">
            ({change >= 0 ? "▲" : "▼"} {Math.abs(change)} since {fmt(points[0].date)})
          </span>
        </p>
      </div>

      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none select-none"
          role="img"
          aria-label={`Health from ${points[0].health} on ${fmt(points[0].date)} to ${last.health} on ${fmt(last.date)}`}
          onPointerMove={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActive(null)}
        >
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">
                {v}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 6} fontSize={10} fill="var(--muted)">
            {fmt(points[0].date)}
          </text>
          <text x={W - PAD.right} y={H - 6} fontSize={10} fill="var(--muted)" textAnchor="end">
            {fmt(last.date)}
          </text>

          {a && (
            <line x1={x(a.date)} x2={x(a.date)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--muted)" strokeWidth={1} />
          )}
          <path d={path} fill="none" stroke="var(--chart-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <circle
              key={p.date}
              cx={x(p.date)}
              cy={y(p.health)}
              r={active === i ? 5 : 4}
              fill="var(--chart-line)"
              stroke="var(--surface)"
              strokeWidth={2}
              tabIndex={0}
              aria-label={`${fmt(p.date)}: health ${p.health}`}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>

        {a && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `${(x(a.date) / W) * 100}%` }}
          >
            <p className="font-medium">{fmt(a.date)}</p>
            <p>Health {a.health}</p>
            {a.heightCm != null && <p className="text-muted">~{Math.round(a.heightCm)} cm tall</p>}
          </div>
        )}
      </div>

      <details className="mt-2 text-sm text-muted">
        <summary className="cursor-pointer select-none">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="py-1 font-medium">Date</th>
              <th className="py-1 font-medium">Health</th>
              <th className="py-1 font-medium">Height</th>
            </tr>
          </thead>
          <tbody className="text-foreground">
            {points.map((p) => (
              <tr key={p.date} className="border-t border-border">
                <td className="py-1">{fmt(p.date)}</td>
                <td className="py-1">{p.health}</td>
                <td className="py-1">{p.heightCm != null ? `~${Math.round(p.heightCm)} cm` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
