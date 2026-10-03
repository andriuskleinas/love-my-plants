import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { acceptHouseholdInvite } from "@/lib/circle.server";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(await createClient());
    const parsed = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) }).safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Invalid invite link.");
    const problem = await acceptHouseholdInvite(parsed.data.token, userId);
    if (problem) throw new HttpError(400, problem);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
