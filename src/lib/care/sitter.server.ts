import "server-only";
import { sitterForMember, type SitterAccess } from "@/lib/circle.server";
import { chatFor } from "@/lib/messenger/links.server";
import { escapeHtml } from "@/lib/messenger/types";
import { sendTelegramMessage, telegramConfigured } from "@/lib/messenger/telegram";
import { waterReminderMessage, waterRemindersIntro } from "@/lib/messenger/reminders";
import { notifyUser } from "@/lib/notify.server";
import { createAdminClient } from "@/lib/supabase/server";
import { HttpError } from "@/lib/plants/server";
import type { DueWaterTask } from "./digest.server";
import { endOfLocalDay, localTime, shouldSendDigest } from "./schedule";
import { answerWaterTask } from "./tasks.server";
import type { WaterOutcome } from "./watering";
import { dueLabel } from "@/lib/plants/format";

/** The owner's time zone and reminder time apply to their sitter. */
export async function ownerSettings(ownerId: string) {
  const { data } = await createAdminClient().from("profiles").select("timezone, digest_time").eq("id", ownerId).maybeSingle();
  return { timeZone: data?.timezone ?? "UTC", digestTime: data?.digest_time ?? "09:00" };
}

export async function sitterPlants(sitter: SitterAccess) {
  if (!sitter.plantIds.length) return [];
  const { data } = await createAdminClient()
    .from("plants")
    .select("id, nickname, species_name, cover_photo_id, species:species_profiles(light, toxic_to_pets)")
    .in("id", sitter.plantIds)
    .eq("home_id", sitter.homeId)
    .neq("status", "archived")
    .order("created_at");
  return data ?? [];
}

export async function dueWaterTasksForSitter(sitter: SitterAccess, dueBefore: Date): Promise<DueWaterTask[]> {
  const plants = await sitterPlants(sitter);
  if (!plants.length) return [];
  const { data: tasks } = await createAdminClient()
    .from("care_tasks")
    .select("id, plant_id, title")
    .in("plant_id", plants.map((p) => p.id))
    .eq("type", "water")
    .in("status", ["pending", "snoozed"])
    .lte("due_at", dueBefore.toISOString())
    .order("due_at");
  return (tasks ?? []).map((t) => ({
    taskId: t.id,
    plantId: t.plant_id,
    nickname: plants.find((p) => p.id === t.plant_id)!.nickname,
    amount: t.title.replace(/^Water about /i, ""),
  }));
}

const OWNER_TEXT: Record<WaterOutcome, (sitter: string, plant: string, next: string) => string> = {
  dry: (s, p, n) => `💧 <b>${s}</b> watered <b>${p}</b>. Next watering: ${n}.`,
  dry_drooping: (s, p, n) => `💧 <b>${s}</b> watered <b>${p}</b>; it was very dry and droopy. Next: ${n}.`,
  damp: (s, p, n) => `🌱 <b>${s}</b> checked <b>${p}</b>: soil still damp, skipped. Next check ${n}.`,
  snooze: (s, p, n) => `⏰ <b>${s}</b> will check <b>${p}</b> ${n}.`,
};

/** A sitter answers a watering reminder: checks access, records it, and tells the owner. */
export async function answerAsSitter(sitter: SitterAccess, taskId: string, outcome: WaterOutcome, now = new Date()) {
  if (sitter.status !== "active") throw new HttpError(403, "Plant-sitting isn't active today. Check your dates with the plant owner.");
  const admin = createAdminClient();
  const { data: task } = await admin.from("care_tasks").select("plant_id, type, plant:plants(nickname, home_id)").eq("id", taskId).maybeSingle();
  const plant = Array.isArray(task?.plant) ? task.plant[0] : task?.plant;
  if (!task || task.type !== "water" || !plant || plant.home_id !== sitter.homeId || !sitter.plantIds.includes(task.plant_id)) {
    throw new HttpError(404, "This plant isn't on your list. Ask the plant owner if it should be.");
  }
  const result = await answerWaterTask(admin, sitter.ownerId, taskId, outcome, now, { memberId: sitter.memberId });
  const next = dueLabel(new Date(result.nextDueAt), now);
  await notifyUser(sitter.ownerId, {
    html: OWNER_TEXT[outcome](escapeHtml(sitter.name), escapeHtml(plant.nickname), next),
    push: {
      title: `${outcome === "dry" || outcome === "dry_drooping" ? "💧" : "🌱"} ${sitter.name} checked ${plant.nickname}`,
      body: outcome === "dry" || outcome === "dry_drooping" ? `Watered. Next: ${next}.` : `Not watered (${outcome === "damp" ? "soil still damp" : "tomorrow"}).`,
      url: `/plants/${task.plant_id}`,
      tag: `sitter-${task.plant_id}`,
    },
  }).catch(() => false);
  return { ...result, nickname: plant.nickname as string };
}

/** Daily Telegram reminders for sitters, at the owner's reminder time. */
export async function runSitterDigest(now = new Date()) {
  if (!telegramConfigured()) return 0;
  const admin = createAdminClient();
  const { data: links } = await admin.from("messenger_links").select("member_id, chat_id").eq("platform", "telegram").not("member_id", "is", null);
  let sent = 0;
  for (const link of links ?? []) {
    const sitter = await sitterForMember(link.member_id, now);
    if (!sitter || sitter.status !== "active") continue;
    const { timeZone, digestTime } = await ownerSettings(sitter.ownerId);
    const { data: member } = await admin.from("home_members").select("last_digest_on").eq("id", sitter.memberId).maybeSingle();
    const local = localTime(timeZone, now);
    if (!shouldSendDigest({ local, digestTime, lastDigestOn: member?.last_digest_on ?? null })) continue;

    const due = await dueWaterTasksForSitter(sitter, endOfLocalDay(timeZone, now));
    try {
      if (due.length > 1) await sendTelegramMessage(link.chat_id, waterRemindersIntro(due.length));
      for (const t of due) {
        const m = waterReminderMessage(t);
        await sendTelegramMessage(link.chat_id, m.html, m.buttons);
      }
      if (due.length) sent++;
    } catch (error) {
      console.error("sitter reminder failed", (error as Error).message);
    }
    await admin.from("home_members").update({ last_digest_on: local.date }).eq("id", sitter.memberId);
  }
  return sent;
}

export async function sitterChat(sitter: SitterAccess) {
  return chatFor("telegram", { memberId: sitter.memberId });
}
