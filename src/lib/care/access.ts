// Care Circle access rules (plan F9). Mirrors the RLS policy in supabase/migrations.

export type CircleRole = "owner" | "household" | "sitter";

export interface CircleMember {
  role: CircleRole;
  startsAt?: Date | null;
  endsAt?: Date | null;
  /** Sitters only: plant ids they may see. Empty/undefined for owner/household = all plants. */
  plantScope?: string[] | null;
}

export function isMemberActive(member: CircleMember, now: Date): boolean {
  if (member.startsAt && now < member.startsAt) return false;
  if (member.endsAt && now > member.endsAt) return false;
  return true;
}

export function canAccessPlant(member: CircleMember, plantId: string, now: Date): boolean {
  if (!isMemberActive(member, now)) return false;
  if (member.role !== "sitter") return true;
  return !!member.plantScope?.includes(plantId);
}

export function canManageHome(member: CircleMember, now: Date): boolean {
  return member.role !== "sitter" && isMemberActive(member, now);
}
