import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { CODE_ALPHABET, CODE_LENGTH, normalizeLinkCode } from "./link-code";
import type { MessengerPlatform } from "./types";

export { formatLinkCode, normalizeLinkCode } from "./link-code";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Who a chat belongs to: an account, or a plant-sitter without one (Care Circle member). */
export type ChatOwner = { userId: string; memberId?: never } | { memberId: string; userId?: never };

const ownerColumn = (owner: ChatOwner) =>
  owner.userId ? (["user_id", owner.userId] as const) : (["member_id", owner.memberId!] as const);

/**
 * One-time connect code, used both in t.me/<bot>?start=<code> and typed into the chat
 * as a fallback. Only its hash is stored.
 */
export async function createLinkToken(owner: string | ChatOwner): Promise<string> {
  const o: ChatOwner = typeof owner === "string" ? { userId: owner } : owner;
  const bytes = randomBytes(CODE_LENGTH);
  const token = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  const admin = createAdminClient();
  const [column, value] = ownerColumn(o);
  await admin.from("messenger_link_tokens").delete().eq(column, value);
  const { error } = await admin.from("messenger_link_tokens").insert({
    token_hash: hash(token),
    [column]: value,
    expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  });
  if (error) throw error;
  return token;
}

/** Links a chat to whoever created the code. Returns the owner, or null if invalid/expired. */
export async function consumeLinkToken(input: string, platform: MessengerPlatform, chatId: string): Promise<ChatOwner | null> {
  const token = normalizeLinkCode(input);
  if (!token) return null;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("messenger_link_tokens")
    .delete()
    .eq("token_hash", hash(token))
    .select("user_id, member_id, expires_at")
    .maybeSingle();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
  const owner: ChatOwner = row.user_id ? { userId: row.user_id } : { memberId: row.member_id };

  // A chat belongs to one owner, and an owner has one chat per platform.
  const [column, value] = ownerColumn(owner);
  await admin.from("messenger_links").delete().eq("platform", platform).eq("chat_id", chatId);
  await admin.from("messenger_links").delete().eq("platform", platform).eq(column, value);
  const { error } = await admin.from("messenger_links").insert({ [column]: value, platform, chat_id: chatId });
  if (error) throw error;
  return owner;
}

export async function ownerForChat(platform: MessengerPlatform, chatId: string): Promise<ChatOwner | null> {
  const { data } = await createAdminClient()
    .from("messenger_links")
    .select("user_id, member_id")
    .eq("platform", platform)
    .eq("chat_id", chatId)
    .maybeSingle();
  if (!data) return null;
  return data.user_id ? { userId: data.user_id } : { memberId: data.member_id };
}

export async function userForChat(platform: MessengerPlatform, chatId: string): Promise<string | null> {
  return (await ownerForChat(platform, chatId))?.userId ?? null;
}

export async function chatFor(platform: MessengerPlatform, owner: ChatOwner): Promise<string | null> {
  const [column, value] = ownerColumn(owner);
  const { data } = await createAdminClient()
    .from("messenger_links")
    .select("chat_id")
    .eq("platform", platform)
    .eq(column, value)
    .maybeSingle();
  return data?.chat_id ?? null;
}

export async function chatForUser(platform: MessengerPlatform, userId: string): Promise<string | null> {
  return chatFor(platform, { userId });
}

export async function unlinkChat(platform: MessengerPlatform, chatId: string) {
  await createAdminClient().from("messenger_links").delete().eq("platform", platform).eq("chat_id", chatId);
}
