// Dev tool: receive Telegram updates without a public URL (long polling) and pass them
// to the local app's webhook route, exactly as Telegram would once deployed.
// Usage: npm run telegram   (keep it running while you test)
process.loadEnvFile(".env.local");
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const app = process.env.APP_URL ?? "http://localhost:3000";
if (!token || !secret) {
  console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local first.");
  process.exit(1);
}

const api = async <T = unknown,>(method: string, body: object = {}) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { ok: boolean; result?: T; description?: string };
};

// Polling and a webhook can't run at the same time.
await api("deleteWebhook");
await api("setMyCommands", {
  commands: [
    { command: "today", description: "What needs water today" },
    { command: "stop", description: "Stop reminders in this chat" },
  ],
});
const me = await api<{ username: string }>("getMe");
console.log(`Polling as @${me.result?.username}. Forwarding updates to ${app}/api/telegram (Ctrl+C to stop)`);

let offset = 0;
for (;;) {
  try {
    const updates = await api<{ update_id: number; callback_query?: unknown }[]>("getUpdates", { offset, timeout: 30, allowed_updates: ["message", "callback_query"] });
    for (const update of updates.result ?? []) {
      offset = update.update_id + 1;
      const res = await fetch(`${app}/api/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
        body: JSON.stringify(update),
      });
      console.log(new Date().toLocaleTimeString(), update.callback_query ? "button" : "message", "→", res.status);
    }
  } catch (error) {
    console.error("poll error:", (error as Error).message);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
