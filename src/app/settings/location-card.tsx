"use client";

import { useState } from "react";

type Place = { label: string; area: string; latitude: number; longitude: number };

/**
 * Home location by address search or device location. Only the town-level area and
 * coordinates rounded to ~1 km are saved; the typed address is never stored.
 */
export function LocationCard({ initialName }: { initialName: string | null }) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(!initialName);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    setMessage(null);
    setResults(null);
    const res = await fetch(`/api/location?q=${encodeURIComponent(query.trim())}`);
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage(json.error ?? "Search failed. Please try again.");
    setResults(json.places);
    if (!json.places.length) setMessage("No matches. Try adding the city or country.");
  }

  function useDeviceLocation() {
    if (!("geolocation" in navigator)) return setMessage("This browser can't share its location.");
    setBusy(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const res = await fetch("/api/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setBusy(false);
          return setMessage(json.error ?? "Couldn't look up your location.");
        }
        await choose(json.place);
      },
      () => {
        setBusy(false);
        setMessage("Location access was denied. Search by address instead.");
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60 * 60 * 1000 },
    );
  }

  async function choose(place: Place) {
    setBusy(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: { latitude: place.latitude, longitude: place.longitude, area: place.area } }),
    });
    setBusy(false);
    if (!res.ok) return setMessage("Couldn't save. Please try again.");
    setName(place.area);
    setEditing(false);
    setResults(null);
    setQuery("");
    setMessage("Saved. Watering now follows the daylight where you live.");
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
      <p className="font-semibold">Where your plants live</p>
      <p className="mt-1 text-muted">Daylight changes a lot through the year. We use it to time watering and judge light.</p>

      {name && !editing ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-leaf-soft px-3 py-2.5">
          <span>📍 {name}</span>
          <button onClick={() => setEditing(true)} className="font-medium text-leaf">
            Change
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={search} className="mt-3 flex gap-2">
            <label htmlFor="address" className="sr-only">
              Address, city or postcode
            </label>
            <input
              id="address"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Address, city or postcode"
              autoComplete="street-address"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-leaf"
            />
            <button
              type="submit"
              disabled={busy || query.trim().length < 2}
              className="rounded-xl bg-leaf px-4 font-medium text-background disabled:opacity-40"
            >
              Search
            </button>
          </form>

          {results && results.length > 0 && (
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
              {results.map((p) => (
                <li key={`${p.latitude},${p.longitude},${p.label}`}>
                  <button disabled={busy} onClick={() => choose(p)} className="w-full px-3 py-2.5 text-left hover:bg-leaf-soft">
                    <span className="block font-medium">{p.area}</span>
                    <span className="block truncate text-xs text-muted">{p.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button disabled={busy} onClick={useDeviceLocation} className="font-medium text-leaf disabled:opacity-50">
              📍 Use my current location
            </button>
            {name && (
              <button onClick={() => setEditing(false)} className="text-muted">
                Cancel
              </button>
            )}
          </div>
        </>
      )}

      {message && (
        <p role="status" className="mt-2 text-muted">
          {message}
        </p>
      )}
      <p className="mt-3 text-xs text-muted">
        We only keep your town and a point rounded to about 1 km, never your street address. Address search by ©
        OpenStreetMap contributors.
      </p>
    </div>
  );
}
