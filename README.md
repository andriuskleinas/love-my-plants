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

## Layout

- `src/lib/care/` contains pure care logic (watering intervals, repot plan, Care Circle access).
- `src/lib/ai/` contains the structured AI output schemas.
- `supabase/migrations/` holds the database schema and row-level security.
- `public/sw.js` is the service worker for push reminders.
