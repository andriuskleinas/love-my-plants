import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { answerWaterTask } from "@/lib/care/tasks.server";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

// "Done ✅ / Snooze ⏰" buttons on a reminder notification (called by the service worker).
const bodySchema = z.object({
  action: z.enum(["done", "snooze"]),
  taskIds: z.array(z.uuid()).min(1).max(50),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await requireUserId(supabase);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Invalid request.");
    const outcome = parsed.data.action === "done" ? "dry" : "snooze";
    const results = await Promise.allSettled(
      parsed.data.taskIds.map((id) => answerWaterTask(supabase, userId, id, outcome)),
    );
    return NextResponse.json({ updated: results.filter((r) => r.status === "fulfilled").length });
  } catch (error) {
    return errorResponse(error);
  }
}
