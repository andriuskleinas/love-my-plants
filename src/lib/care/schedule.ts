// Time-zone helpers for the daily reminder digest (plan F4).

export interface LocalTime {
  /** YYYY-MM-DD in the user's time zone */
  date: string;
  /** minutes since local midnight */
  minutes: number;
}

export function localTime(timeZone: string, now: Date): LocalTime {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return localTime("UTC", now); // unknown zone name
  }
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** The instant the user's local day ends; tasks due before it are "due today". */
export function endOfLocalDay(timeZone: string, now: Date): Date {
  const { minutes } = localTime(timeZone, now);
  return new Date(now.getTime() + (24 * 60 - minutes) * 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
}

/** "09:00" or "09:00:00" → 540 */
export function parseClock(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Send at most one digest per local day, once the user's chosen time has passed. */
export function shouldSendDigest(opts: {
  local: LocalTime;
  digestTime: string;
  lastDigestOn: string | null;
}): boolean {
  if (opts.lastDigestOn === opts.local.date) return false;
  return opts.local.minutes >= parseClock(opts.digestTime);
}
