import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { isMemberActive } from "@/lib/care/access";
import { createAdminClient } from "@/lib/supabase/server";

// Care Circle invite links. Only a hash of each token is stored; the link is shown once
// (and can be regenerated). Household links are single-use; sitter links work until
// the sitter's end date.

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newInviteToken = () => randomBytes(24).toString("base64url");

export interface SitterAccess {
  memberId: string;
  name: string;
  homeId: string;
  /** The home owner: whose time zone, hemisphere and notifications apply. */
  ownerId: string;
  startsAt: Date;
  endsAt: Date;
  plantIds: string[];
  status: "upcoming" | "active" | "ended";
}

const SITTER_FIELDS = "id, display_name, home_id, role, starts_at, ends_at, plant_scope, home:homes(created_by)";

type SitterRow = {
  id: string;
  display_name: string;
  home_id: string;
  starts_at: string | null;
  ends_at: string | null;
  plant_scope: string[] | null;
  home: { created_by: string } | { created_by: string }[] | null;
};

function toSitter(m: SitterRow | null, now: Date): SitterAccess | null {
  if (!m || !m.starts_at || !m.ends_at) return null;
  const home = Array.isArray(m.home) ? m.home[0] : m.home;
  const startsAt = new Date(m.starts_at);
  const endsAt = new Date(m.ends_at);
  return {
    memberId: m.id,
    name: m.display_name,
    homeId: m.home_id,
    ownerId: home!.created_by,
    startsAt,
    endsAt,
    plantIds: m.plant_scope ?? [],
    status: now < startsAt ? "upcoming" : isMemberActive({ role: "sitter", startsAt, endsAt }, now) ? "active" : "ended",
  };
}

/** Resolves a sitter link. Returns null for unknown tokens. */
export async function sitterForToken(token: string, now = new Date()): Promise<SitterAccess | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data } = await createAdminClient()
    .from("home_members")
    .select(SITTER_FIELDS)
    .eq("invite_token_hash", hashToken(token))
    .eq("role", "sitter")
    .maybeSingle();
  return toSitter(data as SitterRow | null, now);
}

export async function sitterForMember(memberId: string, now = new Date()): Promise<SitterAccess | null> {
  const { data } = await createAdminClient()
    .from("home_members")
    .select(SITTER_FIELDS)
    .eq("id", memberId)
    .eq("role", "sitter")
    .maybeSingle();
  return toSitter(data as SitterRow | null, now);
}

/** Accepts a household invite for the signed-in user. Returns an error message or null. */
export async function acceptHouseholdInvite(token: string, userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: m } = await admin
    .from("home_members")
    .select("id, home_id, user_id")
    .eq("invite_token_hash", hashToken(token))
    .eq("role", "household")
    .maybeSingle();
  if (!m || m.user_id) return "This invite link has already been used or was cancelled. Ask for a new one.";

  const { data: existing } = await admin.from("home_members").select("id").eq("home_id", m.home_id).eq("user_id", userId).maybeSingle();
  if (existing) {
    await admin.from("home_members").delete().eq("id", m.id);
    return null; // already a member: nothing to do
  }
  const { error } = await admin
    .from("home_members")
    .update({ user_id: userId, accepted_at: new Date().toISOString(), invite_token_hash: null })
    .eq("id", m.id);
  return error ? "Couldn't join. Please try again." : null;
}
