import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { sendPushToUser } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const sent = await sendPushToUser(userId, {
      title: "🌱 Reminders are on",
      body: "This is how we'll tell you when a plant needs water.",
      url: "/",
      tag: "test",
    });
    if (!sent) throw new HttpError(404, "This device isn't set up for notifications yet, so there's nowhere to send the test. Tap Turn on reminders first.");
    return NextResponse.json({ sent });
  } catch (error) {
    return errorResponse(error);
  }
}
