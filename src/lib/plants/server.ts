import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { MESSAGES, nextUtcMidnight } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/server";

export const PHOTO_BUCKET = "plant-photos";
export const DAILY_AI_LIMIT = 20;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** For limits: when trying again will work. The app shows it in the user's time. */
    readonly retryAt?: Date,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message, retryAt: error.retryAt?.toISOString() }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: MESSAGES.server }, { status: 500 });
}

export async function requireUserId(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) throw new HttpError(401, MESSAGES.signedOut);
  return sub;
}

/** The home new plants go into: the user's own home, else one they help care for. */
export async function getManagedHomeId(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from("home_members")
    .select("home_id, role")
    .eq("user_id", userId)
    .in("role", ["owner", "household"])
    .order("role"); // enum order: owner before household
  const homeId = data?.[0]?.home_id;
  if (!homeId) throw new HttpError(403, "Your account isn't fully set up (no home was found for it). Please sign out and sign in again.");
  return homeId;
}

/** Counts one AI call against the user's daily limit; throws 429 when exceeded. */
export async function consumeAiQuota(userId: string): Promise<void> {
  const admin = createAdminClient();
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await admin.from("ai_usage").select("calls").eq("user_id", userId).eq("day", day).maybeSingle();
  const calls = data?.calls ?? 0;
  if (calls >= DAILY_AI_LIMIT) {
    throw new HttpError(
      429,
      `You've used all ${DAILY_AI_LIMIT} photo checks for today. There's a daily limit to keep the AI costs fair.`,
      nextUtcMidnight(),
    );
  }
  await admin.from("ai_usage").upsert({ user_id: userId, day, calls: calls + 1 });
}

export const DAILY_CHAT_LIMIT = 60;

/** Counts one Plant Buddy chat message; throws 429 when the day's allowance is used. */
export async function consumeChatQuota(userId: string): Promise<void> {
  const admin = createAdminClient();
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await admin.from("ai_usage").select("calls, chat_calls").eq("user_id", userId).eq("day", day).maybeSingle();
  const used = data?.chat_calls ?? 0;
  if (used >= DAILY_CHAT_LIMIT) {
    throw new HttpError(
      429,
      `You've sent ${DAILY_CHAT_LIMIT} messages to Plant Buddy today, which is the daily limit (it keeps the AI costs fair).`,
      nextUtcMidnight(),
    );
  }
  await admin.from("ai_usage").upsert({ user_id: userId, day, calls: data?.calls ?? 0, chat_calls: used + 1 });
}

export function speciesSlug(scientificName: string): string {
  return scientificName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
