// Dev tool: run the daily reminder job once against the local app (what the scheduler does every 15 min).
// Usage: npm run reminders
process.loadEnvFile(".env.local");
const base = process.env.APP_URL ?? "http://localhost:3000";
const res = await fetch(`${base}/api/cron/reminders`, {
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
});
console.log(res.status, await res.text());
