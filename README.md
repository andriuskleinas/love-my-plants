# Love My Plants 🪴

Snap a photo of a house plant and get a health check, three simple care steps for today, watering reminders that learn, a repot plan, a growth time-lapse, rescue plans, vacation prep and a plant-sitter link.

Installable web app (PWA): Next.js + Supabase + Claude vision. A Telegram "Plant Buddy" chat is planned.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your own keys; never commit .env.local
npm run dev
```

## Tests

```bash
npm test          # care logic: watering, repot plan, access rules, AI output schema
```

Database access rules (RLS) can be checked against a throwaway local Postgres:

```bash
psql -d <scratch_db> -f supabase/tests/stubs.sql \
  -f supabase/migrations/20261003000000_init.sql \
  -f supabase/tests/rls_test.sql
```

## Production

Live at https://love-my-plants.vercel.app (Vercel, deploys from `main`).

- **Environment variables** are set in Vercel → Project → Settings → Environment Variables
  (same names as `.env.example`; `CRON_SECRET` is only for local runs).
- **Reminders** run every 15 minutes from Supabase (`pg_cron` + `pg_net`) calling
  `/api/cron/reminders`. The bearer secret is generated inside the database (Vault) and checked by
  `verify_cron_secret()`. To point the job at a new domain:
  `select private.schedule_reminders('https://your-domain');`
- **Telegram** delivers updates by webhook to `/api/telegram`, authenticated with
  `TELEGRAM_WEBHOOK_SECRET`. `npm run telegram` (local long polling) removes the webhook, so
  re-set it afterwards.
- **Supabase Auth**: the production URL must be the Site URL and in Redirect URLs.

## Layout

- `src/lib/care/` contains pure care logic (watering intervals, repot plan, Care Circle access).
- `src/lib/ai/` contains the structured AI output schemas.
- `supabase/migrations/` holds the database schema and row-level security.
- `public/sw.js` is the service worker for push reminders.
