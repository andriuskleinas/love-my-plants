import "server-only";
import { sendPushToUser } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/server";
import { isMemberActive } from "./access";
import { endOfLocalDay, localTime, shouldSendDigest } from "./schedule";

/**
 * Daily watering digest (plan F4): one notification per user per day, at their chosen
 * local time, listing every plant they care for that needs water by the end of today.
 * Runs from the cron endpoint every 15 minutes.
 */
export async function runDailyDigest(now = new Date()) {
  const admin = createAdminClient();
  const { data: subs } = await admin.from("push_subscriptions").select("user_id");
  const userIds = [...new Set((subs ?? []).map((s) => s.user_id))];
  if (!userIds.length) return { users: 0, sent: 0 };

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, timezone, digest_time, last_digest_on")
    .in("id", userIds);

  let sent = 0;
  for (const profile of profiles ?? []) {
    const local = localTime(profile.timezone, now);
    if (!shouldSendDigest({ local, digestTime: profile.digest_time, lastDigestOn: profile.last_digest_on })) continue;

    const due = await dueWaterTasksFor(profile.id, endOfLocalDay(profile.timezone, now), now);
    if (due.length) {
      const names = due.map((t) => `${t.nickname} (${t.amount})`);
      const delivered = await sendPushToUser(profile.id, {
        title: due.length === 1 ? `💧 ${due[0].nickname} needs water today` : `💧 ${due.length} plants need water today`,
        body: `${names.join(" · ")}. Check the soil is dry first.`,
        url: "/",
        tag: `digest-${local.date}`,
        taskIds: due.map((t) => t.taskId),
      });
      if (delivered) sent++;
    }
    await admin.from("profiles").update({ last_digest_on: local.date }).eq("id", profile.id);
  }
  return { users: profiles?.length ?? 0, sent };
}

async function dueWaterTasksFor(userId: string, dueBefore: Date, now: Date) {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("home_members")
    .select("home_id, role, starts_at, ends_at, plant_scope")
    .eq("user_id", userId);
  const active = (members ?? []).filter((m) =>
    isMemberActive(
      { role: m.role, startsAt: m.starts_at && new Date(m.starts_at), endsAt: m.ends_at && new Date(m.ends_at) },
      now,
    ),
  );
  if (!active.length) return [];

  const { data: plants } = await admin
    .from("plants")
    .select("id, home_id, nickname")
    .in("home_id", active.map((m) => m.home_id))
    .neq("status", "archived");
  const visible = (plants ?? []).filter((p) => {
    const m = active.find((a) => a.home_id === p.home_id)!;
    return m.role !== "sitter" || (m.plant_scope ?? []).includes(p.id);
  });
  if (!visible.length) return [];

  const { data: tasks } = await admin
    .from("care_tasks")
    .select("id, plant_id, title")
    .in("plant_id", visible.map((p) => p.id))
    .eq("type", "water")
    .in("status", ["pending", "snoozed"])
    .lte("due_at", dueBefore.toISOString())
    .order("due_at");

  return (tasks ?? []).map((t) => ({
    taskId: t.id,
    nickname: visible.find((p) => p.id === t.plant_id)!.nickname,
    amount: t.title.replace(/^Water about /i, ""),
  }));
}
