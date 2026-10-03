import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runDailyDigest } from "@/lib/care/digest.server";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * Called every 15 minutes by Supabase pg_cron with a secret that lives only in the
 * database's Vault (checked via verify_cron_secret). CRON_SECRET from the environment
 * also works, for `npm run reminders` during development.
 */
export async function GET(request: NextRequest) {
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!(await authorized(given))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runDailyDigest());
}

async function authorized(given: string): Promise<boolean> {
  if (given.length < 32 || given.length > 128) return false;
  const local = process.env.CRON_SECRET;
  if (local && given.length === local.length && timingSafeEqual(Buffer.from(given), Buffer.from(local))) return true;
  const { data } = await createAdminClient().rpc("verify_cron_secret", { token: given });
  return data === true;
}
