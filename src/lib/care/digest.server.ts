import "server-only";
import { chatForUser } from "@/lib/messenger/links.server";
import { sendTelegramMessage, telegramConfigured } from "@/lib/messenger/telegram";
import { waterReminderMessage, waterRemindersIntro } from "@/lib/messenger/reminders";
import { sendPushToUser } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/server";
import { isMemberActive } from "./access";
import { endOfLocalDay, localTime, shouldSendDigest } from "./schedule";

export interface DueWaterTask {
  taskId: string;
  plantId: string;
  nickname: string;
  /** e.g. "150 ml" */
  amount: string;
}

/**
 * Daily watering digest (plan F4): one round of reminders per user per day, at their
 * chosen local time, on every channel they connected (Telegram and/or browser push).
 * Runs from the cron endpoint every 15 minutes.
 */
export async function runDailyDigest(now = new Date()) {
  const admin = createAdminClient();
  const [{ data: subs }, { data: links }] = await Promise.all([
    admin.from("push_subscriptions").select("user_id"),
    admin.from("messenger_links").select("user_id"),
  ]);
  const userIds = [...new Set([...(subs ?? []), ...(links ?? [])].map((s) => s.user_id))];
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
    if (due.length && (await sendWaterReminders(profile.id, due, local.date))) sent++;
    await admin.from("profiles").update({ last_digest_on: local.date }).eq("id", profile.id);
  }
  return { users: profiles?.length ?? 0, sent };
}

/** Sends today's watering reminders on every connected channel. Returns true if any arrived. */
export async function sendWaterReminders(userId: string, due: DueWaterTask[], localDate: string): Promise<boolean> {
  let delivered = false;

  const chatId = telegramConfigured() ? await chatForUser("telegram", userId) : null;
  if (chatId) {
    try {
      if (due.length > 1) await sendTelegramMessage(chatId, waterRemindersIntro(due.length));
      for (const task of due) {
        const msg = waterReminderMessage(task);
        await sendTelegramMessage(chatId, msg.html, msg.buttons);
      }
      delivered = true;
    } catch (error) {
      console.error("telegram reminder failed", (error as Error).message);
    }
  }

  const pushed = await sendPushToUser(userId, {
    title: due.length === 1 ? `💧 ${due[0].nickname} needs water today` : `💧 ${due.length} plants need water today`,
    body: `${due.map((t) => `${t.nickname} (${t.amount})`).join(" · ")}. Check the soil is dry first.`,
    url: "/",
    tag: `digest-${localDate}`,
    taskIds: due.map((t) => t.taskId),
  });
  return delivered || pushed > 0;
}

/** Active Care Circle memberships of a user (sitters only within their dates). */
async function activeMemberships(userId: string, now: Date) {
  const { data: members } = await createAdminClient()
    .from("home_members")
    .select("home_id, role, starts_at, ends_at, plant_scope")
    .eq("user_id", userId);
  return (members ?? []).filter((m) =>
    isMemberActive(
      { role: m.role, startsAt: m.starts_at && new Date(m.starts_at), endsAt: m.ends_at && new Date(m.ends_at) },
      now,
    ),
  );
}

/** Mirrors the plants RLS policy, for server code running with the service role. */
export async function userCanAccessPlant(userId: string, plantId: string, now = new Date()): Promise<boolean> {
  const { data: plant } = await createAdminClient().from("plants").select("home_id").eq("id", plantId).maybeSingle();
  if (!plant) return false;
  const m = (await activeMemberships(userId, now)).find((a) => a.home_id === plant.home_id);
  return !!m && (m.role !== "sitter" || (m.plant_scope ?? []).includes(plantId));
}

export async function dueWaterTasksFor(userId: string, dueBefore: Date, now: Date): Promise<DueWaterTask[]> {
  const admin = createAdminClient();
  const active = await activeMemberships(userId, now);
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
    plantId: t.plant_id,
    nickname: visible.find((p) => p.id === t.plant_id)!.nickname,
    amount: t.title.replace(/^Water about /i, ""),
  }));
}
