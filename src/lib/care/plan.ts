// Long-term care plan helpers (plan F5/F6).
import type { Hemisphere } from "./watering";

const DAY_MS = 24 * 60 * 60 * 1000;

export const CHECKIN_EVERY_DAYS = 7;
/** Remind about a repot this many days before its window opens. */
export const REPOT_NOTICE_DAYS = 7;

/**
 * Feeding season: spring and summer (Mar 15 – Sep 15 north, Sep 15 – Mar 15 south).
 * Returns whether we're in it now and the current/next season's dates.
 */
export function feedingSeason(now: Date, hemisphere: Hemisphere = "north") {
  const year = now.getFullYear();
  const [startMonth, endMonth] = hemisphere === "north" ? [2, 8] : [8, 2];
  const season = (startYear: number) => {
    const start = new Date(startYear, startMonth, 15);
    const end = new Date(startYear + (endMonth < startMonth ? 1 : 0), endMonth, 15);
    return { start, end };
  };
  for (const y of [year - 1, year, year + 1]) {
    const s = season(y);
    if (now >= s.start && now < s.end) return { active: true, ...s };
    if (now < s.start) return { active: false, ...s };
  }
  return { active: false, ...season(year + 1) };
}

/** A weekly photo is due when the newest photo is a week old (and the plant isn't brand new). */
export function needsCheckin(lastPhotoAt: Date | null, now: Date): boolean {
  if (!lastPhotoAt) return true;
  return now.getTime() - lastPhotoAt.getTime() >= CHECKIN_EVERY_DAYS * DAY_MS;
}

export function daysSince(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / DAY_MS);
}

/** Change between two scores, for "▲ 5" style labels. */
export function scoreDelta(current: number, previous: number | null | undefined): number | null {
  return previous == null ? null : current - previous;
}
