-- Reminder scheduler: pg_cron calls the app's /api/cron/reminders every 15 minutes via pg_net.
-- The shared secret is generated here, kept in Vault, and never leaves the database except in
-- that request; the app verifies it by calling verify_cron_secret() with the service role.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret', 'Bearer token for /api/cron/reminders');
  end if;
end $$;

create or replace function public.verify_cron_secret(token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'cron_secret' and decrypted_secret = token);
$$;
revoke execute on function public.verify_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_cron_secret(text) to service_role;

-- Schedules (or reschedules) the job for the app's public URL, e.g.
--   select private.schedule_reminders('https://love-my-plants.vercel.app');
create or replace function private.schedule_reminders(app_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app_url !~ '^https://[a-z0-9.-]+(:[0-9]+)?$' then
    raise exception 'app_url must be an https origin without a path';
  end if;
  perform cron.schedule(
    'love-my-plants-reminders',
    '*/15 * * * *',
    format(
      $job$select net.http_get(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
        timeout_milliseconds := 55000
      )$job$,
      app_url || '/api/cron/reminders'
    )
  );
end;
$$;
revoke execute on function private.schedule_reminders(text) from public, anon, authenticated;
