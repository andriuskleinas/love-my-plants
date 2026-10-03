import "server-only";

// Address lookup via OpenStreetMap Nominatim. Calls go through our server so the
// user's IP isn't shared, and are throttled to the service's 1 request/second policy.
// https://operations.osmfoundation.org/policies/nominatim/

const BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "LoveMyPlants/0.1 (+https://github.com/andriuskleinas/love-my-plants)";

export interface Place {
  /** Full match shown to the user when choosing (never stored). */
  label: string;
  /** Town-level name that is stored, e.g. "Vilnius, Lithuania". */
  area: string;
  latitude: number;
  longitude: number;
}

/** ~1 km precision: enough for daylight and weather, not enough to find a home. */
export const roundCoord = (v: number) => Math.round(v * 100) / 100;

let lastCall = 0;
async function throttle() {
  const wait = lastCall + 1100 - Date.now();
  lastCall = Math.max(Date.now(), lastCall + 1100);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
};

function areaName(r: NominatimResult): string {
  const a = r.address ?? {};
  const town = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state;
  return [town, a.country].filter(Boolean).join(", ") || r.display_name.split(",").slice(-2).join(",").trim();
}

async function call(path: string, params: Record<string, string>): Promise<unknown> {
  await throttle();
  const url = `${BASE}${path}?${new URLSearchParams({ format: "jsonv2", addressdetails: "1", ...params })}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`geocoder ${res.status}`);
  return res.json();
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const results = (await call("/search", { q: query, limit: "5" })) as NominatimResult[];
  return results.map((r) => ({
    label: r.display_name,
    area: areaName(r),
    latitude: roundCoord(Number(r.lat)),
    longitude: roundCoord(Number(r.lon)),
  }));
}

export async function areaForCoords(latitude: number, longitude: number): Promise<Place | null> {
  // zoom=10 asks for city level, so no street details come back at all.
  const r = (await call("/reverse", { lat: String(latitude), lon: String(longitude), zoom: "10" })) as
    | NominatimResult
    | { error: string };
  if ("error" in r) return null;
  return {
    label: areaName(r),
    area: areaName(r),
    latitude: roundCoord(latitude),
    longitude: roundCoord(longitude),
  };
}
