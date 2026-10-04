// Shared, user-facing error wording. Every message says what happened, why, and what to do.

/** "15:52 (in about 1 hour)" in the viewer's own time zone. */
export function formatRetry(retryAt: Date, now = new Date(), timeZone?: string): string {
  const time = retryAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
  return `${time} (${inAbout(retryAt.getTime() - now.getTime())})`;
}

export function inAbout(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
}

/** Daily allowances reset at midnight UTC (the day key used for usage counting). */
export function nextUtcMidnight(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export const MESSAGES = {
  offline: "You're offline. Check your internet connection and try again.",
  signedOut: "You've been signed out. Please sign in again.",
  timeout: "This took too long and nothing was saved. Please try again.",
  unavailable: "The app is temporarily unavailable. Please try again in a few minutes.",
  server: "Something went wrong and this wasn't saved. Please try again.",
  badRequest: "This didn't go through. Refresh the page and try again.",
  photoUnreadable:
    "This photo can't be opened. Take a new photo with the camera, or choose a JPEG or PNG.",
  uploadFailed: "The photo didn't upload. Check your connection and try again.",
} as const;
