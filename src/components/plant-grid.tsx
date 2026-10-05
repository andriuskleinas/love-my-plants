"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CloseIcon, PlusIcon, SearchIcon, TrendIcon } from "@/components/icons";
import { scoreTone } from "@/components/report-card";
import { matchesSearch, SEARCH_FROM, SORT_LABELS, sortPlants, type PlantCard, type SortMode, type Trend } from "@/lib/plants/collection";

const TREND_WORDS: Record<Trend, string> = { up: "better than last check", down: "worse than last check", steady: "same as last check" };

/** The collection: photo cards with sort chips, and a search box once there are enough plants. */
export function PlantGrid({ plants }: { plants: PlantCard[] }) {
  const [sort, setSort] = useState<SortMode>("attention");
  const [query, setQuery] = useState("");
  const shown = useMemo(() => sortPlants(plants.filter((p) => matchesSearch(p, query)), sort), [plants, query, sort]);
  const searching = query.trim() !== "";

  return (
    <>
      {plants.length > SEARCH_FROM && (
        <label className="relative mt-2 block">
          <span className="sr-only">Search plants</span>
          <SearchIcon size={20} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or species"
            className="h-12 w-full rounded-full border border-border bg-surface pl-11 pr-11 outline-none placeholder:text-muted focus:border-leaf [&::-webkit-search-cancel-button]:hidden"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-background"
            >
              <CloseIcon size={18} />
            </button>
          )}
        </label>
      )}

      <div role="group" aria-label="Sort plants" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={sort === mode}
            onClick={() => setSort(mode)}
            className={`h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors ${
              sort === mode ? "border-leaf bg-leaf text-background" : "border-border bg-surface text-muted hover:text-foreground"
            }`}
          >
            {SORT_LABELS[mode]}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="font-medium">No plants match “{query.trim()}”</p>
          <button type="button" onClick={() => setQuery("")} className="mt-2 text-sm font-medium text-leaf">
            Show all plants
          </button>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-live="polite">
          {shown.map((p) => (
            <li key={p.id}>
              <Card plant={p} />
            </li>
          ))}
          {!searching && (
            <li>
              <Link
                href="/plants/new"
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-sm font-medium text-muted hover:border-leaf hover:text-leaf"
              >
                <PlusIcon size={28} />
                Add a plant
              </Link>
            </li>
          )}
        </ul>
      )}
    </>
  );
}

function Card({ plant: p }: { plant: PlantCard }) {
  const tone = p.health != null ? scoreTone(p.health) : null;
  return (
    <Link
      href={`/plants/${p.id}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-surface transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square bg-leaf-soft">
        {p.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-5xl" aria-hidden>
            🪴
          </span>
        )}
        {tone && (
          <span
            className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full bg-surface/95 py-1 pl-2 pr-2.5 text-xs font-semibold shadow-sm"
            aria-label={`Health ${p.health} out of 100: ${tone.label}${p.trend ? `, ${TREND_WORDS[p.trend]}` : ""}`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${tone.bar}`} aria-hidden />
            <span className="truncate" aria-hidden>
              {tone.label}
            </span>
            {p.trend && <TrendIcon trend={p.trend} size={14} strokeWidth={2.4} className={`shrink-0 ${tone.text}`} />}
          </span>
        )}
      </div>
      <div className="px-3 pb-3 pt-2.5">
        <p className="truncate font-semibold">{p.nickname}</p>
        <p className="truncate text-xs italic text-muted">{p.species ?? " "}</p>
        {p.next ? (
          <p className={`mt-1.5 truncate text-xs font-medium ${p.next.urgent ? "text-terracotta" : "text-muted"}`}>
            <span aria-hidden>{p.next.icon}</span> {p.next.text}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-muted">All set</p>
        )}
      </div>
    </Link>
  );
}
