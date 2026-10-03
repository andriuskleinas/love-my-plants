import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { CODE_ALPHABET, CODE_LENGTH, normalizeLinkCode } from "./link-code";
import type { MessengerPlatform } from "./types";

export { formatLinkCode, normalizeLinkCode } from "./link-code";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * One-time connect code, used both in t.me/<bot>?start=<code> and typed into the chat
 * as a fallback. Only its hash is stored.
 */
export async function createLinkToken(userId: string): Promise<string> {
  const bytes = randomBytes(CODE_LENGTH);
  const token = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  const admin = createAdminClient();
  await admin.from("messenger_link_tokens").delete().eq("user_id", userId);
  const { error } = await admin.from("messenger_link_tokens").insert({
    token_hash: hash(token),
    user_id: userId,
    expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  });
  if (error) throw error;
  return token;
}

/** Links a chat to the account that created the token. Returns the user id, or null if invalid/expired. */
export async function consumeLinkToken(input: string, platform: MessengerPlatform, chatId: string) {
  const token = normalizeLinkCode(input);
  if (!token) return null;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("messenger_link_tokens")
    .delete()
    .eq("token_hash", hash(token))
    .select("user_id, expires_at")
    .maybeSingle();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;

  // A chat belongs to one account, and an account has one chat per platform.
  await admin.from("messenger_links").delete().eq("platform", platform).eq("chat_id", chatId);
  await admin.from("messenger_links").delete().eq("platform", platform).eq("user_id", row.user_id);
  const { error } = await admin.from("messenger_links").insert({ user_id: row.user_id, platform, chat_id: chatId });
  if (error) throw error;
  return row.user_id as string;
}

export async function userForChat(platform: MessengerPlatform, chatId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("messenger_links")
    .select("user_id")
    .eq("platform", platform)
    .eq("chat_id", chatId)
    .maybeSingle();
  return data?.user_id ?? null;
}

export async function chatForUser(platform: MessengerPlatform, userId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("messenger_links")
    .select("chat_id")
    .eq("platform", platform)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.chat_id ?? null;
}

export async function unlinkChat(platform: MessengerPlatform, chatId: string) {
  await createAdminClient().from("messenger_links").delete().eq("platform", platform).eq("chat_id", chatId);
}
