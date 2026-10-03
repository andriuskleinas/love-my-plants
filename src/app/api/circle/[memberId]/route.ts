import { NextResponse, type NextRequest } from "next/server";
import { hashToken, newInviteToken } from "@/lib/circle.server";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

// POST → new link (old one stops working). PATCH → end a sitter's access now. DELETE → remove.

export async function POST(request: NextRequest, ctx: RouteContext<"/api/circle/[memberId]">) {
  try {
    const { memberId } = await ctx.params;
    const supabase = await createClient();
    await requireUserId(supabase);
    const token = newInviteToken();
    const { data, error } = await supabase
      .from("home_members")
      .update({ invite_token_hash: hashToken(token) })
      .eq("id", memberId)
      .or("role.eq.sitter,user_id.is.null") // sitters, or household invites not yet accepted
      .select("role")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Can't make a new link for this person.");
    const origin = new URL(request.url).origin;
    return NextResponse.json({ url: `${origin}/${data.role === "sitter" ? "sit" : "join"}/${token}` });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(_request: NextRequest, ctx: RouteContext<"/api/circle/[memberId]">) {
  try {
    const { memberId } = await ctx.params;
    const supabase = await createClient();
    await requireUserId(supabase);
    const now = new Date().toISOString();
    const { data: m } = await supabase.from("home_members").select("starts_at").eq("id", memberId).eq("role", "sitter").maybeSingle();
    if (!m) throw new HttpError(404, "Sitter not found.");
    // Ending before it started: shrink to a zero-length window that's already over.
    const startsAt =
      m.starts_at && new Date(m.starts_at).getTime() > Date.now() ? new Date(Date.now() - 60_000).toISOString() : m.starts_at;
    const { error } = await supabase.from("home_members").update({ starts_at: startsAt, ends_at: now }).eq("id", memberId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/circle/[memberId]">) {
  try {
    const { memberId } = await ctx.params;
    const supabase = await createClient();
    await requireUserId(supabase);
    const { data, error } = await supabase.from("home_members").delete().eq("id", memberId).select("id");
    if (error) throw error;
    if (!data.length) throw new HttpError(403, "You can't remove this person.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
