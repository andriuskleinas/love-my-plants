import "server-only";
import { dueWaterTasksFor, userCanAccessPlant } from "@/lib/care/digest.server";
import { endOfLocalDay } from "@/lib/care/schedule";
import { answerAsSitter, dueWaterTasksForSitter, ownerSettings } from "@/lib/care/sitter.server";
import { answerWaterTask } from "@/lib/care/tasks.server";
import { sitterForMember } from "@/lib/circle.server";
import { dueLabel } from "@/lib/plants/format";
import { createAdminClient } from "@/lib/supabase/server";
import { consumeLinkToken, normalizeLinkCode, ownerForChat, unlinkChat, userForChat } from "./links.server";
import { decodeWaterAnswer, waterAnswerSummary, waterReminderMessage } from "./reminders";
import { escapeHtml } from "./types";
import { answerTelegramCallback, editTelegramMessage, sendTelegramMessage } from "./telegram";

// Subset of https://core.telegram.org/bots/api#update that we use.
export interface TelegramUpdate {
  update_id: number;
  message?: { message_id: number; chat: { id: number; type: string }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number; type: string } };
  };
}

const HELP =
  "🌿 <b>Love My Plants</b>\n\n" +
  "I send your watering reminders. Tap the buttons under a reminder to tell me how the soil was, and I'll learn each plant's rhythm.\n\n" +
  "/today: what needs water today\n/stop: stop reminders in this chat\n\n" +
  "Chatting about your plants (and checking products in the shop) is coming soon.";

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) return handleCallback(update.callback_query);

  const msg = update.message;
  if (!msg?.text) return;
  const chatId = String(msg.chat.id);
  if (msg.chat.type !== "private") {
    await sendTelegramMessage(chatId, "Please message me in a private chat.");
    return;
  }

  const [command, arg] = msg.text.trim().split(/\s+/, 2);
  switch (command.toLowerCase().replace(/@\w+$/, "")) {
    case "/start":
      return handleStart(chatId, arg);
    case "/today":
      return handleToday(chatId);
    case "/stop":
      await unlinkChat("telegram", chatId);
      await sendTelegramMessage(chatId, "Disconnected. You won't get reminders here anymore. Reconnect any time from the app's Settings.");
      return;
    default:
      // A connect code typed by hand (when the Start link didn't carry it).
      if (normalizeLinkCode(msg.text)) return handleStart(chatId, msg.text);
      await sendTelegramMessage(chatId, HELP);
  }
}

const SEND_CODE =
  "👋 Hi! To connect, open Love My Plants → ⚙️ Settings → <b>Connect Telegram</b>, then send me the 8-character code shown there (like <code>K7MP-3XQ2</code>).";

async function handleStart(chatId: string, token?: string) {
  if (token) {
    const owner = await consumeLinkToken(token, "telegram", chatId);
    if (owner?.memberId) {
      const sitter = await sitterForMember(owner.memberId);
      const until = sitter?.endsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
      await sendTelegramMessage(
        chatId,
        `✅ <b>Connected, ${escapeHtml(sitter?.name ?? "plant-sitter")}!</b> Thanks for looking after these plants. ` +
          `You'll get a message on days one needs water${until ? ` (until ${until})` : ""}, with buttons to answer.\n\nSend /today any time.`,
      );
      return;
    }
    await sendTelegramMessage(
      chatId,
      owner
        ? "✅ <b>Connected!</b> Your watering reminders will arrive here at your reminder time.\n\nSend /today to see what needs water now."
        : "That code didn't work. It may have expired (codes last 15 minutes). In the app, tap <b>Connect Telegram</b> again for a new one.",
    );
    return;
  }
  const linked = await userForChat("telegram", chatId);
  await sendTelegramMessage(
    chatId,
    linked
      ? `You're connected ✅\n\n${HELP}`
      : SEND_CODE,
  );
}

async function userTimeZone(userId: string) {
  const { data } = await createAdminClient().from("profiles").select("timezone").eq("id", userId).maybeSingle();
  return data?.timezone ?? "UTC";
}

async function handleToday(chatId: string) {
  const owner = await ownerForChat("telegram", chatId);
  if (!owner) return handleStart(chatId);
  const now = new Date();
  let due;
  if (owner.memberId) {
    const sitter = await sitterForMember(owner.memberId, now);
    if (!sitter || sitter.status !== "active") {
      await sendTelegramMessage(chatId, "Your plant-sitting dates aren't active right now. Thank you for helping! 🌿");
      return;
    }
    due = await dueWaterTasksForSitter(sitter, endOfLocalDay((await ownerSettings(sitter.ownerId)).timeZone, now));
  } else {
    const userId = owner.userId!;
    due = await dueWaterTasksFor(userId, endOfLocalDay(await userTimeZone(userId), now), now);
  }
  if (!due.length) {
    await sendTelegramMessage(chatId, "🌿 Nothing needs water today. Your plants are all set.");
    return;
  }
  for (const task of due) {
    const m = waterReminderMessage(task);
    await sendTelegramMessage(chatId, m.html, m.buttons);
  }
}

async function handleCallback(cb: NonNullable<TelegramUpdate["callback_query"]>) {
  const answer = cb.data ? decodeWaterAnswer(cb.data) : null;
  const chatId = cb.message ? String(cb.message.chat.id) : null;
  if (!answer || !chatId || !cb.message) {
    await answerTelegramCallback(cb.id);
    return;
  }

  const owner = await ownerForChat("telegram", chatId);
  if (!owner) {
    await answerTelegramCallback(cb.id, "This chat isn't connected anymore.");
    return;
  }
  if (owner.memberId) return handleSitterCallback(cb, chatId, owner.memberId, answer);
  const userId = owner.userId!;

  // The bot runs with the service role, so check Care Circle access explicitly.
  const admin = createAdminClient();
  const { data: task } = await admin
    .from("care_tasks")
    .select("plant_id, due_at, plant:plants(nickname)")
    .eq("id", answer.taskId)
    .maybeSingle();
  if (!task || !(await userCanAccessPlant(userId, task.plant_id))) {
    await answerTelegramCallback(cb.id, "This reminder isn't available anymore.");
    await editTelegramMessage(chatId, cb.message.message_id, "This reminder isn't available anymore.");
    return;
  }
  const nickname = (Array.isArray(task.plant) ? task.plant[0] : task.plant)?.nickname ?? "Your plant";

  // Old reminder tapped after it was already answered (in the app or another message).
  const now = new Date();
  if (new Date(task.due_at).getTime() > endOfLocalDay(await userTimeZone(userId), now).getTime()) {
    await answerTelegramCallback(cb.id, "Already done ✓");
    await editTelegramMessage(
      chatId,
      cb.message.message_id,
      `✓ ${nickname} is already taken care of. Next watering: ${dueLabel(new Date(task.due_at), now)}.`,
    );
    return;
  }

  const result = await answerWaterTask(admin, userId, answer.taskId, answer.outcome, now);
  await answerTelegramCallback(cb.id, answer.outcome === "snooze" ? "OK, tomorrow" : "Saved ✓");
  await editTelegramMessage(
    chatId,
    cb.message.message_id,
    waterAnswerSummary(nickname, answer.outcome, dueLabel(new Date(result.nextDueAt), now)),
  );
}

/** A plant-sitter tapped a reminder button. */
async function handleSitterCallback(
  cb: NonNullable<TelegramUpdate["callback_query"]>,
  chatId: string,
  memberId: string,
  answer: NonNullable<ReturnType<typeof decodeWaterAnswer>>,
) {
  const now = new Date();
  const sitter = await sitterForMember(memberId, now);
  if (!sitter || sitter.status !== "active") {
    await answerTelegramCallback(cb.id, "Your plant-sitting dates aren't active right now.");
    return;
  }
  // Already handled (by the owner or an earlier tap)?
  const { data: task } = await createAdminClient().from("care_tasks").select("due_at").eq("id", answer.taskId).maybeSingle();
  const { timeZone } = await ownerSettings(sitter.ownerId);
  if (task && new Date(task.due_at).getTime() > endOfLocalDay(timeZone, now).getTime()) {
    await answerTelegramCallback(cb.id, "Already done ✓");
    await editTelegramMessage(chatId, cb.message!.message_id, `✓ Already taken care of. Next: ${dueLabel(new Date(task.due_at), now)}.`);
    return;
  }
  try {
    const result = await answerAsSitter(sitter, answer.taskId, answer.outcome, now);
    await answerTelegramCallback(cb.id, "Saved ✓ Thank you!");
    await editTelegramMessage(
      chatId,
      cb.message!.message_id,
      waterAnswerSummary(result.nickname, answer.outcome, dueLabel(new Date(result.nextDueAt), now)),
    );
  } catch (error) {
    await answerTelegramCallback(cb.id, (error as Error).message.slice(0, 180));
  }
}
