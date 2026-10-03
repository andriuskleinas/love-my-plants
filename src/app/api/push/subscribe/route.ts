import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.url().startsWith("https://"),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  }),
  timeZone: z.string().max(64).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const parsed = subscribeSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Invalid subscription.");
    const { subscription, timeZone } = parsed.data;

    // Endpoints are unique per browser; re-subscribing moves it to this user.
    await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    const { error } = await supabase.from("push_subscriptions").insert({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    });
    if (error) throw error;

    if (timeZone && isValidTimeZone(timeZone)) {
      await supabase.from("profiles").update({ timezone: timeZone }).eq("id", userId);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    await requireUserId(supabase);
    const { endpoint } = (await request.json()) as { endpoint?: string };
    if (endpoint) await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
