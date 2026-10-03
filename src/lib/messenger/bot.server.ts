import "server-only";
import { AssessmentError } from "@/lib/ai/assess";
import { askBuddy } from "@/lib/ai/buddy";
import { addShoppingItems, loadShopping, setItemStatus, shoppingHomeFor } from "@/lib/care/shopping.server";
import { consumeChatQuota, HttpError } from "@/lib/plants/server";
import { decodeShopping, formatBuddyReply, formatShoppingList } from "./buddy-format";
import { dueWaterTasksFor, userCanAccessPlant, visiblePlantsFor } from "@/lib/care/digest.server";
import { endOfLocalDay } from "@/lib/care/schedule";
import { answerAsSitter, dueWaterTasksForSitter, ownerSettings } from "@/lib/care/sitter.server";
import { answerWaterTask } from "@/lib/care/tasks.server";
import { sitterForMember } from "@/lib/circle.server";
import { dueLabel } from "@/lib/plants/format";
import { createAdminClient } from "@/lib/supabase/server";
import { consumeLinkToken, normalizeLinkCode, ownerForChat, unlinkChat, userForChat } from "./links.server";
import { decodeWaterAnswer, waterAnswerSummary, waterReminderMessage } from "./reminders";
import { escapeHtml } from "./types";
import {
  answerTelegramCallback,
  downloadTelegramPhoto,
  editTelegramMessage,
  sendTelegramMessage,
  sendTelegramTyping,
  type TelegramPhotoSize,
} from "./telegram";

// Subset of https://core.telegram.org/bots/api#update that we use.
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    text?: string;
    caption?: string;
    photo?: TelegramPhotoSize[];
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number; type: string } };
  };
}

const HELP =
  "🌿 <b>Plant Buddy</b>\n\n" +
  "• Ask me anything about your plants, in any language.\n" +
  "• In a shop? Send a photo of soil, a pot or fertilizer and I'll tell you if it suits your plants.\n" +
  "• Tap the buttons under a watering reminder and I'll learn each plant's rhythm.\n\n" +
  "/today: what needs water today\n/list: your shopping list\n/plants: how your plants are doing\n/stop: stop messages in this chat";

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) return handleCallback(update.callback_query);

  const msg = update.message;
  if (msg?.photo?.length && msg.chat.type === "private") return handleChat(String(msg.chat.id), msg.caption ?? "", msg.photo);
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
    case "/list":
      return handleList(chatId);
    case "/plants":
      return handlePlants(chatId);
    case "/help":
      await sendTelegramMessage(chatId, HELP);
      return;
    case "/stop":
      await unlinkChat("telegram", chatId);
      await sendTelegramMessage(chatId, "Disconnected. You won't get reminders here anymore. Reconnect any time from the app's Settings.");
      return;
    default:
      // A connect code typed by hand (when the Start link didn't carry it).
      if (normalizeLinkCode(msg.text)) return handleStart(chatId, msg.text);
      if (command.startsWith("/")) {
        await sendTelegramMessage(chatId, HELP);
        return;
      }
      return handleChat(chatId, msg.text);
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
  const shopping = cb.data ? decodeShopping(cb.data) : null;
  if (shopping && cb.message) return handleShoppingCallback(cb, String(cb.message.chat.id), shopping);
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
      `✓ ${escapeHtml(nickname)} is already taken care of. Next watering: ${dueLabel(new Date(task.due_at), now)}.`,
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

/** Free text or a photo: Plant Buddy answers (owners and household; sitters get a pointer). */
async function handleChat(chatId: string, text: string, photo?: TelegramPhotoSize[]) {
  const owner = await ownerForChat("telegram", chatId);
  if (!owner) return handleStart(chatId);
  if (owner.memberId) {
    await sendTelegramMessage(
      chatId,
      "I'm here to send you watering reminders while you look after these plants. For anything else, please ask the plant owner. Thank you! 🌿",
    );
    return;
  }
  const userId = owner.userId!;
  await sendTelegramTyping(chatId);
  try {
    await consumeChatQuota(userId);
    const image = photo ? { base64: await downloadTelegramPhoto(photo), mediaType: "image/jpeg" as const } : undefined;
    const reply = await askBuddy({ userId, text: text.slice(0, 2000), image });

    // Shopping items the owner asked for, linked to the plant when named.
    let added: string[] = [];
    if (reply.addToShoppingList.length) {
      const homeId = await shoppingHomeFor(userId);
      if (homeId) {
        const { data: plants } = await createAdminClient().from("plants").select("id, nickname").eq("home_id", homeId);
        const plantId = (name: string | null) =>
          plants?.find((p) => name && p.nickname.toLowerCase() === name.toLowerCase())?.id ?? null;
        const items = reply.addToShoppingList.map((i) => ({ item: i.item, reason: i.reason, plantId: plantId(i.plant) }));
        if (await addShoppingItems(homeId, items, "chat")) added = items.map((i) => i.item);
      }
    }
    await sendTelegramMessage(chatId, formatBuddyReply(reply, added));
  } catch (error) {
    const message =
      error instanceof AssessmentError || error instanceof HttpError
        ? error instanceof AssessmentError
          ? error.userMessage
          : error.message
        : "Sorry, something went wrong. Please try again.";
    if (!(error instanceof HttpError)) console.error("buddy failed", error);
    await sendTelegramMessage(chatId, escapeHtml(message));
  }
}

async function shoppingFor(chatId: string) {
  const owner = await ownerForChat("telegram", chatId);
  if (!owner?.userId) return null;
  const homeId = await shoppingHomeFor(owner.userId);
  return homeId ? { homeId } : null;
}

async function handleList(chatId: string) {
  const ctx = await shoppingFor(chatId);
  if (!ctx) {
    await sendTelegramMessage(chatId, "Connect your account first: Love My Plants → ⚙️ Settings → Connect Telegram.");
    return;
  }
  const { items, suggestions } = await loadShopping(ctx.homeId);
  const m = formatShoppingList(items, suggestions);
  await sendTelegramMessage(chatId, m.html, m.buttons);
}

async function handleShoppingCallback(
  cb: NonNullable<TelegramUpdate["callback_query"]>,
  chatId: string,
  action: NonNullable<ReturnType<typeof decodeShopping>>,
) {
  const ctx = await shoppingFor(chatId);
  if (!ctx) {
    await answerTelegramCallback(cb.id, "This chat isn't connected anymore.");
    return;
  }
  if (action.kind === "bought") {
    const item = await setItemStatus(ctx.homeId, action.id, "bought");
    await answerTelegramCallback(cb.id, item ? `✓ ${item}` : "Already done");
  } else {
    const { suggestions } = await loadShopping(ctx.homeId);
    const n = await addShoppingItems(ctx.homeId, suggestions.map((s) => ({ item: s.item, reason: s.reason, plantId: s.plantId })), "plan");
    await answerTelegramCallback(cb.id, n ? `Added ${n} item${n > 1 ? "s" : ""}` : "Already on your list");
  }
  const { items, suggestions } = await loadShopping(ctx.homeId);
  const m = formatShoppingList(items, suggestions);
  await editTelegramMessage(chatId, cb.message!.message_id, m.html, m.buttons);
}

async function handlePlants(chatId: string) {
  const owner = await ownerForChat("telegram", chatId);
  if (!owner?.userId) return handleToday(chatId);
  const now = new Date();
  const plants = await visiblePlantsFor(owner.userId, now);
  if (!plants.length) {
    await sendTelegramMessage(chatId, "You haven't added any plants yet. Open the app and tap 📷 to add your first one.");
    return;
  }
  const admin = createAdminClient();
  const ids = plants.map((p) => p.id);
  const [{ data: checks }, { data: tasks }, { data: rescues }] = await Promise.all([
    admin.from("assessments").select("plant_id, health").in("plant_id", ids).order("created_at", { ascending: false }),
    admin.from("care_tasks").select("plant_id, due_at").in("plant_id", ids).eq("type", "water").in("status", ["pending", "snoozed"]),
    admin.from("rescue_plans").select("plant_id").in("plant_id", ids).is("ended_at", null),
  ]);
  const lines = plants.map((p) => {
    const health = checks?.find((c) => c.plant_id === p.id)?.health;
    const water = tasks?.find((t) => t.plant_id === p.id);
    const dot = health == null ? "⚪" : health >= 70 ? "🟢" : health >= 45 ? "🟡" : "🔴";
    return (
      `${dot} <b>${escapeHtml(p.nickname)}</b>${health != null ? ` · health ${health}` : ""}` +
      (water ? ` · 💧 ${dueLabel(new Date(water.due_at), now)}` : "") +
      (rescues?.some((r) => r.plant_id === p.id) ? " · 🚨 in rescue" : "")
    );
  });
  await sendTelegramMessage(chatId, `🪴 <b>Your plants</b>\n${lines.join("\n")}`);
}
