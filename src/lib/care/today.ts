// The Today briefing: greeting, one ordered to-do list, and what's coming up this week.

import { CHECKIN_EVERY_DAYS } from "./plan";
import { localTime } from "./schedule";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far ahead "Coming up" looks. */
export const COMING_UP_DAYS = 7;

export type TodayTask =
  | { kind: "rescue"; key: string; plantId: string; nickname: string; photoUrl: string | null; text: string }
  | {
      kind: "water";
      key: string;
      plantId: string;
      nickname: string;
      photoUrl: string | null;
      taskId: string;
      title: string;
      detail: string | null;
      dueAt: string;
      overdue: boolean;
    }
  | { kind: "checkin"; key: string; plantId: string; nickname: string; photoUrl: string | null }
  | {
      kind: "step";
      key: string;
      plantId: string;
      nickname: string;
      photoUrl: string | null;
      assessmentId: string;
      index: number;
      step: string;
      why: string;
    };

const ORDER = { rescue: 0, water: 1, checkin: 2, step: 3 } as const;

/** Most urgent first: rescues, overdue watering, watering today, check-ins, then the AI's steps. */
export function orderTasks(tasks: TodayTask[]): TodayTask[] {
  const rank = (t: TodayTask) => ORDER[t.kind] * 2 + (t.kind === "water" && !t.overdue ? 1 : 0);
  return tasks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || (a.t.kind === "water" && b.t.kind === "water" ? a.t.dueAt.localeCompare(b.t.dueAt) : 0) || a.i - b.i)
    .map(({ t }) => t);
}

export function greeting(timeZone: string, now: Date, name?: string | null): string {
  const hour = Math.floor(localTime(timeZone, now).minutes / 60);
  const part = hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 18 ? "Good afternoon" : hour >= 18 && hour < 23 ? "Good evening" : "Hello";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

/** "Saturday 4 October" in the user's time zone. */
export function longDate(timeZone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(now);
  } catch {
    return longDate("UTC", now);
  }
}

/** Whole local days from today to `date` (0 = today, 1 = tomorrow). */
export function daysAhead(timeZone: string, now: Date, date: Date): number {
  const day = (d: Date) => Date.parse(`${localTime(timeZone, d).date}T00:00:00Z`);
  return Math.round((day(date) - day(now)) / DAY_MS);
}

/** "Tomorrow", "Tuesday", or "Tue 14 Oct" beyond a week. */
export function dayLabel(timeZone: string, now: Date, date: Date): string {
  const n = daysAhead(timeZone, now, date);
  if (n <= 0) return "Today";
  if (n === 1) return "Tomorrow";
  const opts: Intl.DateTimeFormatOptions = n < 7 ? { weekday: "long" } : { weekday: "short", day: "numeric", month: "short" };
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, ...opts }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(date);
  }
}

export type ComingUp = { key: string; date: string; icon: string; text: string; href: string };

/**
 * The next few things after today: waterings, weekly check-ins, repot windows and a trip.
 * Everything due today or earlier is on the to-do list instead.
 */
export function comingUp(
  input: {
    water: { plantId: string; nickname: string; dueAt: string }[];
    lastPhotos: { plantId: string; nickname: string; takenAt: string | null }[];
    repots: { plantId: string; nickname: string; targetDate: string }[];
    trip: { startsAt: string } | null;
  },
  timeZone: string,
  now: Date,
  limit = 5,
): ComingUp[] {
  const inWindow = (d: Date) => {
    const n = daysAhead(timeZone, now, d);
    return n >= 1 && n <= COMING_UP_DAYS;
  };
  const items: ComingUp[] = [];
  for (const w of input.water) {
    const d = new Date(w.dueAt);
    if (inWindow(d)) items.push({ key: `w${w.plantId}`, date: d.toISOString(), icon: "💧", text: `Water ${w.nickname}`, href: `/plants/${w.plantId}` });
  }
  for (const p of input.lastPhotos) {
    if (!p.takenAt) continue;
    const d = new Date(new Date(p.takenAt).getTime() + CHECKIN_EVERY_DAYS * DAY_MS);
    if (inWindow(d)) items.push({ key: `c${p.plantId}`, date: d.toISOString(), icon: "📸", text: `Weekly check-in for ${p.nickname}`, href: `/plants/${p.plantId}/checkin` });
  }
  for (const r of input.repots) {
    const d = new Date(`${r.targetDate}T12:00:00Z`);
    if (inWindow(d)) items.push({ key: `r${r.plantId}`, date: d.toISOString(), icon: "🪴", text: `Time to repot ${r.nickname}`, href: `/plants/${r.plantId}` });
  }
  if (input.trip && inWindow(new Date(input.trip.startsAt))) {
    items.push({ key: "trip", date: input.trip.startsAt, icon: "🧳", text: "Your trip starts", href: "/vacation" });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}
