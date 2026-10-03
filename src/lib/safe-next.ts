/**
 * Only same-site paths. Parsing (rather than checking for "//") also rejects tricks like
 * "/\\evil.example", which browsers treat as "//evil.example".
 */
export function safeNext(raw: string | null, origin: string): string {
  if (!raw || !raw.startsWith("/")) return "/";
  try {
    const url = new URL(raw, origin);
    return url.origin === origin ? `${url.pathname}${url.search}` : "/";
  } catch {
    return "/";
  }
}
