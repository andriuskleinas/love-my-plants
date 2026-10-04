"use client";

import { formatRetry, MESSAGES } from "./errors";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/**
 * fetch() for the app's own API with clear errors for every failure: offline,
 * signed out, timeouts, server problems, and the server's own explanations
 * (with "try again at …" when a limit was reached).
 */
export async function callApi<T = Record<string, unknown>>(url: string, init?: RequestInit & { json?: unknown }): Promise<ApiResult<T>> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      ...(json !== undefined ? { body: JSON.stringify(json), headers: { "Content-Type": "application/json", ...rest.headers } } : {}),
    });
  } catch {
    // fetch only throws for network problems (offline, DNS, connection dropped).
    return { ok: false, status: 0, error: MESSAGES.offline };
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON: e.g. a hosting timeout page */
  }
  if (res.ok) return { ok: true, data: (body ?? {}) as T };
  return { ok: false, status: res.status, error: describeError(res.status, body) };
}

export function describeError(status: number, body: Record<string, unknown> | null): string {
  const serverMessage = typeof body?.error === "string" ? body.error : null;
  const retryAt = typeof body?.retryAt === "string" ? new Date(body.retryAt) : null;
  if (serverMessage && retryAt && !Number.isNaN(retryAt.getTime())) {
    return `${serverMessage} You can try again from ${formatRetry(retryAt)}.`;
  }
  if (status === 401) return MESSAGES.signedOut;
  if (serverMessage) return serverMessage;
  if (status === 504 || status === 408) return MESSAGES.timeout;
  if (status === 502 || status === 503) return MESSAGES.unavailable;
  if (status === 400) return MESSAGES.badRequest;
  return MESSAGES.server;
}
