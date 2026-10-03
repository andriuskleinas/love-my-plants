import "server-only";
import { chatForUser } from "@/lib/messenger/links.server";
import { sendTelegramMessage, telegramConfigured } from "@/lib/messenger/telegram";
import {
  checkinNudgeMessage,
  repotNudgeMessage,
  rescueDayMessage,
  waterReminderMessage,
  waterRemindersIntro,
} from "@/lib/messenger/reminders";
import { sendPushToUser } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/server";
import { isMemberActive } from "./access";
import { CHECKIN_EVERY_DAYS, needsCheckin, REPOT_NOTICE_DAYS } from "./plan";
import type { RepotDetails } from "./plan.server";
import { planLength, rescueDay, stepsDueOn, type RescueStep } from "./rescue";
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
    .select("id, timezone, digest_time, last_digest_on, last_checkin_nudge_on")
    .in("id", userIds);

  let sent = 0;
  for (const profile of profiles ?? []) {
    const local = localTime(profile.timezone, now);
    if (!shouldSendDigest({ local, digestTime: profile.digest_time, lastDigestOn: profile.last_digest_on })) continue;

    const due = await dueWaterTasksFor(profile.id, endOfLocalDay(profile.timezone, now), now);
    if (due.length && (await sendWaterReminders(profile.id, due, local.date))) sent++;
    await sendRescueUpdates(profile.id, profile.timezone, now);
    await sendCareNudges(profile.id, local.date, profile.last_checkin_nudge_on, now);
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

/** Sends one message on every connected channel (Telegram first, then browser push). */
async function notifyUser(
  userId: string,
  msg: { html: string; push: { title: string; body: string; url: string; tag: string } },
): Promise<boolean> {
  let delivered = false;
  const chatId = telegramConfigured() ? await chatForUser("telegram", userId) : null;
  if (chatId) {
    try {
      await sendTelegramMessage(chatId, msg.html);
      delivered = true;
    } catch (error) {
      console.error("telegram nudge failed", (error as Error).message);
    }
  }
  return (await sendPushToUser(userId, msg.push)) > 0 || delivered;
}

/** Daily message per active rescue: today's steps (incl. unfinished ones) and photo days. */
async function sendRescueUpdates(userId: string, timeZone: string, now: Date) {
  const plants = await visiblePlantsFor(userId, now);
  if (!plants.length) return;
  const { data: rescues } = await createAdminClient()
    .from("rescue_plans")
    .select("plant_id, started_at, steps, progress, extra")
    .in("plant_id", plants.map((p) => p.id))
    .is("ended_at", null);
  for (const r of rescues ?? []) {
    const steps = r.steps as RescueStep[];
    const day = rescueDay(new Date(r.started_at), now, timeZone);
    const length = planLength(steps);
    const open = stepsDueOn(steps, r.progress as Record<string, string>, day).filter((s) => !s.done);
    const checkinDays = ((r.extra as { checkinDays?: number[] }).checkinDays ?? []) as number[];
    const nickname = plants.find((p) => p.id === r.plant_id)!.nickname;
    await notifyUser(userId, {
      html: rescueDayMessage(nickname, day, length, open.map((s) => s.step), checkinDays.includes(day) || day > length),
      push: {
        title: `🚨 ${nickname}: rescue day ${Math.min(day, length)}`,
        body: open.length ? open.map((s) => s.step).join(" · ") : "Nothing to do today.",
        url: `/plants/${r.plant_id}/rescue`,
        tag: `rescue-${r.plant_id}`,
      },
    });
  }
}

/**
 * Longer-term nudges, at most once each: a repot window opening within a week, and a
 * weekly photo check-in for plants without a photo in the last 7 days.
 */
async function sendCareNudges(userId: string, localDate: string, lastCheckinNudgeOn: string | null, now: Date) {
  const admin = createAdminClient();
  const plants = await visiblePlantsFor(userId, now);
  if (!plants.length) return;
  const ids = plants.map((p) => p.id);
  const name = (id: string) => plants.find((p) => p.id === id)!.nickname;

  // Repot windows opening soon.
  const soon = new Date(now.getTime() + REPOT_NOTICE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data: repots } = await admin
    .from("milestones")
    .select("id, plant_id, details")
    .in("plant_id", ids)
    .eq("type", "repot")
    .is("done_at", null)
    .is("notified_at", null)
    .lte("target_date", soon);
  for (const m of repots ?? []) {
    const details = m.details as RepotDetails;
    const html = repotNudgeMessage(name(m.plant_id), details.recommendedPotCm, details.reasons);
    await notifyUser(userId, {
      html,
      push: {
        title: `🪴 Time to repot ${name(m.plant_id)}`,
        body: `Move it to a ${details.recommendedPotCm} cm pot.`,
        url: `/plants/${m.plant_id}`,
        tag: `repot-${m.plant_id}`,
      },
    });
    await admin.from("milestones").update({ notified_at: now.toISOString() }).eq("id", m.id);
  }

  // Weekly check-in, at most once a week.
  const lastNudge = lastCheckinNudgeOn ? new Date(`${lastCheckinNudgeOn}T00:00:00Z`) : null;
  if (lastNudge && new Date(`${localDate}T00:00:00Z`).getTime() - lastNudge.getTime() < CHECKIN_EVERY_DAYS * 86_400_000) return;
  const { data: photos } = await admin
    .from("photos")
    .select("plant_id, taken_at")
    .in("plant_id", ids)
    .order("taken_at", { ascending: false });
  const lastPhoto = new Map<string, Date>();
  photos?.forEach((p) => lastPhoto.has(p.plant_id) || lastPhoto.set(p.plant_id, new Date(p.taken_at)));
  const due = plants.filter((p) => needsCheckin(lastPhoto.get(p.id) ?? null, now));
  if (!due.length) return;

  await notifyUser(userId, {
    html: checkinNudgeMessage(due.map((p) => p.nickname), process.env.APP_URL),
    push: {
      title: "📸 Weekly plant check-in",
      body: `Snap ${due.map((p) => p.nickname).join(", ")} to see how they're growing.`,
      url: "/",
      tag: `checkin-${localDate}`,
    },
  });
  await admin.from("profiles").update({ last_checkin_nudge_on: localDate }).eq("id", userId);
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

/** Plants a user cares for right now: whole homes, or a sitter's scoped plants. */
export async function visiblePlantsFor(userId: string, now: Date) {
  const active = await activeMemberships(userId, now);
  if (!active.length) return [];
  const { data: plants } = await createAdminClient()
    .from("plants")
    .select("id, home_id, nickname")
    .in("home_id", active.map((m) => m.home_id))
    .neq("status", "archived");
  return (plants ?? []).filter((p) => {
    const m = active.find((a) => a.home_id === p.home_id)!;
    return m.role !== "sitter" || (m.plant_scope ?? []).includes(p.id);
  });
}

export async function dueWaterTasksFor(userId: string, dueBefore: Date, now: Date): Promise<DueWaterTask[]> {
  const admin = createAdminClient();
  const visible = await visiblePlantsFor(userId, now);
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
