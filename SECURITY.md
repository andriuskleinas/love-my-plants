# Security policy

## Reporting a vulnerability

Please don't open a public issue for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/andriuskleinas/love-my-plants/security/advisories/new)
instead. I'll reply within a few days.

## How the app is protected

- **Row-level security** on every table. Access to plants, photos and tasks goes through
  `private.has_plant_access()`, which also enforces plant-sitter date windows and plant scope.
  Tables that only the server touches have RLS on and no policies.
- **No secrets in the repo.** Keys live in environment variables (`.env.local` locally, Vercel in
  production). `.env.example` lists the names only.
- **Invite, sitter and messenger link tokens** are random and stored only as SHA-256 hashes.
  Messenger connect codes are single-use and expire after 15 minutes.
- **Webhook and cron endpoints** check their secrets with constant-time comparison. The reminder
  cron secret is generated inside the database (Supabase Vault) and never leaves it.
- **Headers:** per-request nonce-based Content Security Policy, HSTS, `X-Frame-Options: DENY`,
  `nosniff`, a strict referrer policy and a narrow `Permissions-Policy`.
- **Redirects** after sign-in only go to same-site paths (`src/lib/safe-next.ts`).
- **AI usage** is capped per user per day, and AI output is validated against a schema before it
  is stored.
- **Location** is stored rounded to about 1 km.
