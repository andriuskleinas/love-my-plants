-- Supabase security advisor: keep pg_net out of the public schema.
-- Its functions stay in the `net` schema, so the reminder job is unchanged.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
