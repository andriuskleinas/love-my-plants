-- Love My Plants: initial schema (plan §4).
-- Access model: a user belongs to one or more homes via home_members (Care Circle).
-- Owners and household members see the whole home; sitters with an account see only
-- their scoped plants within their date window. Sitters without an account use a
-- secret link that the server resolves with the service role (never exposed to clients).

create extension if not exists pgcrypto;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.circle_role as enum ('owner', 'household', 'sitter');
create type public.pot_material as enum ('plastic', 'ceramic', 'terracotta', 'other');
create type public.window_direction as enum ('N', 'E', 'S', 'W', 'none');
create type public.plant_status as enum ('ok', 'er', 'archived');
create type public.photo_kind as enum ('whole', 'soil', 'spot', 'triage', 'checkin', 'product');
create type public.task_type as enum ('water', 'light', 'prune', 'repot', 'fertilize', 'pests', 'clean', 'rotate', 'mist', 'vacation_prep', 'rescue', 'other');
create type public.task_status as enum ('pending', 'done', 'skipped', 'snoozed');
create type public.milestone_type as enum ('repot', 'fertilize_season', 'prune', 'propagate', 'dormancy');
create type public.messenger_platform as enum ('telegram', 'whatsapp');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  hemisphere text not null default 'north' check (hemisphere in ('north', 'south')),
  digest_time time not null default '09:00',
  language text not null default 'en',
  reminder_channels text[] not null default array['push'],
  created_at timestamptz not null default now()
);

create table public.homes (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My plants',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.home_members (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  display_name text not null,
  role public.circle_role not null,
  -- sha256 of the secret sitter/invite link; the raw token is only ever shown once.
  invite_token_hash text unique,
  accepted_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  plant_scope uuid[],
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (role <> 'sitter' or ends_at is not null),
  unique (home_id, user_id)
);
create index home_members_user_id_idx on public.home_members (user_id);
create index home_members_home_id_idx on public.home_members (home_id);

create table public.species_profiles (
  id text primary key, -- normalized scientific name, e.g. 'monstera-deliciosa'
  scientific_name text not null,
  common_name text not null,
  base_water_interval_days numeric not null check (base_water_interval_days > 0),
  repot_interval_months int not null default 24,
  light text not null,
  humidity text not null,
  temperature text not null,
  fertilizer text not null,
  toxic_to_pets boolean,
  soil_mix text,
  notes text,
  updated_at timestamptz not null default now()
);

create table public.plants (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  nickname text not null,
  species_id text references public.species_profiles (id),
  species_name text,
  pot_diameter_cm numeric not null check (pot_diameter_cm > 0),
  pot_material public.pot_material not null default 'plastic',
  has_drainage boolean not null default true,
  window_direction public.window_direction not null default 'none',
  location text,
  status public.plant_status not null default 'ok',
  cover_photo_id uuid,
  water_learned_factor numeric not null default 1 check (water_learned_factor between 0.5 and 2),
  last_watered_at timestamptz,
  last_repotted_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index plants_home_id_idx on public.plants (home_id);
create index plants_species_id_idx on public.plants (species_id);
create index plants_created_by_idx on public.plants (created_by);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  kind public.photo_kind not null,
  storage_path text not null unique, -- '{home_id}/{plant_id}/{uuid}.jpg' in bucket plant-photos
  taken_by uuid references auth.users (id) on delete set null,
  taken_at timestamptz not null default now()
);
create index photos_plant_id_taken_at_idx on public.photos (plant_id, taken_at desc);
create index photos_taken_by_idx on public.photos (taken_by);

alter table public.plants
  add constraint plants_cover_photo_fk foreign key (cover_photo_id) references public.photos (id) on delete set null;
create index plants_cover_photo_id_idx on public.plants (cover_photo_id);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  photo_ids uuid[] not null,
  health int not null check (health between 0 and 100),
  scores jsonb not null,
  issues jsonb not null default '[]',
  actions jsonb not null default '[]',
  estimated_height_cm numeric,
  raw jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);
create index assessments_plant_id_created_at_idx on public.assessments (plant_id, created_at desc);

create table public.care_tasks (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  type public.task_type not null,
  title text not null,
  detail text,
  due_at timestamptz not null,
  interval_days numeric, -- null = one-off
  assigned_to uuid references public.home_members (id) on delete set null,
  status public.task_status not null default 'pending',
  last_notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index care_tasks_plant_id_idx on public.care_tasks (plant_id);
create index care_tasks_assigned_to_idx on public.care_tasks (assigned_to);
-- Reminder dispatcher scans pending tasks by due date.
create index care_tasks_pending_due_idx on public.care_tasks (due_at) where status in ('pending', 'snoozed');

create table public.care_events (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  task_id uuid references public.care_tasks (id) on delete set null,
  type public.task_type not null,
  done_by_member uuid references public.home_members (id) on delete set null,
  soil_feedback text check (soil_feedback in ('dry', 'damp', 'dry_drooping')),
  note text,
  photo_id uuid references public.photos (id) on delete set null,
  done_at timestamptz not null default now()
);
create index care_events_plant_id_done_at_idx on public.care_events (plant_id, done_at desc);
create index care_events_task_id_idx on public.care_events (task_id);
create index care_events_done_by_member_idx on public.care_events (done_by_member);
create index care_events_photo_id_idx on public.care_events (photo_id);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  type public.milestone_type not null,
  target_date date not null,
  details jsonb not null default '{}',
  done_at timestamptz,
  unique (plant_id, type)
);

create table public.rescue_plans (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  diagnosis jsonb not null,
  steps jsonb not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  outcome text check (outcome in ('recovered', 'propagated', 'lost'))
);
create index rescue_plans_plant_id_idx on public.rescue_plans (plant_id);

create table public.vacations (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  sitter_member_id uuid references public.home_members (id) on delete set null,
  prep_checklist jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index vacations_home_id_idx on public.vacations (home_id);
create index vacations_sitter_member_id_idx on public.vacations (sitter_member_id);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  plant_id uuid references public.plants (id) on delete cascade,
  item text not null,
  reason text,
  status text not null default 'open' check (status in ('open', 'bought', 'dismissed')),
  created_at timestamptz not null default now()
);
create index shopping_items_home_id_idx on public.shopping_items (home_id);
create index shopping_items_plant_id_idx on public.shopping_items (plant_id);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

create table public.messenger_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform public.messenger_platform not null,
  chat_id text not null,
  created_at timestamptz not null default now(),
  unique (platform, chat_id),
  unique (user_id, platform)
);

-- One-time tokens for t.me/<bot>?start=<token>. Written/read only by the server.
create table public.messenger_link_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);
create index messenger_link_tokens_user_id_idx on public.messenger_link_tokens (user_id);

create table public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  photo_id uuid references public.photos (id) on delete set null,
  created_at timestamptz not null default now()
);
create index chat_messages_user_id_created_at_idx on public.chat_messages (user_id, created_at desc);
create index chat_messages_photo_id_idx on public.chat_messages (photo_id);

-- Per-user daily AI usage for cost limits.
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  calls int not null default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Access helpers (private schema is not exposed through the Data API)
-- ---------------------------------------------------------------------------
create or replace function private.is_active_member(m public.home_members)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (m.starts_at is null or m.starts_at <= now())
     and (m.ends_at is null or m.ends_at >= now());
$$;

create or replace function private.home_ids_for_user()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.home_id from public.home_members m
  where m.user_id = (select auth.uid()) and private.is_active_member(m);
$$;

create or replace function private.managed_home_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.home_id from public.home_members m
  where m.user_id = (select auth.uid())
    and m.role in ('owner', 'household')
    and private.is_active_member(m);
$$;

create or replace function private.has_plant_access(p_plant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plants p
    join public.home_members m on m.home_id = p.home_id
    where p.id = p_plant_id
      and m.user_id = (select auth.uid())
      and private.is_active_member(m)
      and (m.role <> 'sitter' or p.id = any (m.plant_scope))
  );
$$;

grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- New user bootstrap: profile + home + owner membership
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_home uuid;
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, display_name) values (new.id, v_name);
  insert into public.homes (created_by) values (new.id) returning id into v_home;
  insert into public.home_members (home_id, user_id, display_name, role, accepted_at)
  values (v_home, new.id, v_name, 'owner', now());
  return new;
end;
$$;
-- Trigger-only; users must never call it directly.
revoke execute on function private.handle_new_user() from authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.homes enable row level security;
alter table public.home_members enable row level security;
alter table public.species_profiles enable row level security;
alter table public.plants enable row level security;
alter table public.photos enable row level security;
alter table public.assessments enable row level security;
alter table public.care_tasks enable row level security;
alter table public.care_events enable row level security;
alter table public.milestones enable row level security;
alter table public.rescue_plans enable row level security;
alter table public.vacations enable row level security;
alter table public.shopping_items enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.messenger_links enable row level security;
alter table public.messenger_link_tokens enable row level security; -- no policies: server only
alter table public.chat_messages enable row level security;
alter table public.ai_usage enable row level security;              -- no policies: server only

-- Profiles: own row only.
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Homes: members can read; managers can rename; only the creator can delete.
create policy homes_select on public.homes for select to authenticated
  using (id in (select private.home_ids_for_user()));
create policy homes_update on public.homes for update to authenticated
  using (id in (select private.managed_home_ids()));
create policy homes_delete on public.homes for delete to authenticated
  using (created_by = (select auth.uid()));

-- Members: everyone in the home sees the circle; managers invite/edit/remove.
create policy members_select on public.home_members for select to authenticated
  using (home_id in (select private.home_ids_for_user()));
create policy members_insert on public.home_members for insert to authenticated
  with check (home_id in (select private.managed_home_ids()) and role <> 'owner');
create policy members_update on public.home_members for update to authenticated
  using (home_id in (select private.managed_home_ids()))
  with check (home_id in (select private.managed_home_ids()) and role <> 'owner');
create policy members_delete on public.home_members for delete to authenticated
  using (role <> 'owner' and (home_id in (select private.managed_home_ids()) or user_id = (select auth.uid())));

-- Species profiles: shared reference data, read-only to users (server writes).
create policy species_select on public.species_profiles for select to authenticated using (true);

-- Plants: full access for managers, scoped read for sitters.
-- The managed-home check also lets `insert ... returning` see the new row.
create policy plants_select on public.plants for select to authenticated
  using (home_id in (select private.managed_home_ids()) or (select private.has_plant_access(id)));
create policy plants_insert on public.plants for insert to authenticated
  with check (home_id in (select private.managed_home_ids()));
create policy plants_update on public.plants for update to authenticated
  using (home_id in (select private.managed_home_ids()));
create policy plants_delete on public.plants for delete to authenticated
  using (home_id in (select private.managed_home_ids()));

-- Plant-scoped tables: anyone with plant access can read and add (sitters log waterings
-- and photos); managers can change and delete.
create policy photos_select on public.photos for select to authenticated using ((select private.has_plant_access(plant_id)));
create policy photos_insert on public.photos for insert to authenticated with check ((select private.has_plant_access(plant_id)));
create policy photos_delete on public.photos for delete to authenticated
  using (plant_id in (select id from public.plants where home_id in (select private.managed_home_ids())));

create policy assessments_select on public.assessments for select to authenticated using ((select private.has_plant_access(plant_id)));

create policy tasks_select on public.care_tasks for select to authenticated using ((select private.has_plant_access(plant_id)));
create policy tasks_insert on public.care_tasks for insert to authenticated
  with check (plant_id in (select id from public.plants where home_id in (select private.managed_home_ids())));
create policy tasks_update on public.care_tasks for update to authenticated using ((select private.has_plant_access(plant_id)));
create policy tasks_delete on public.care_tasks for delete to authenticated
  using (plant_id in (select id from public.plants where home_id in (select private.managed_home_ids())));

create policy events_select on public.care_events for select to authenticated using ((select private.has_plant_access(plant_id)));
create policy events_insert on public.care_events for insert to authenticated with check ((select private.has_plant_access(plant_id)));

create policy milestones_select on public.milestones for select to authenticated using ((select private.has_plant_access(plant_id)));
create policy milestones_update on public.milestones for update to authenticated
  using (plant_id in (select id from public.plants where home_id in (select private.managed_home_ids())));

create policy rescue_select on public.rescue_plans for select to authenticated using ((select private.has_plant_access(plant_id)));
create policy rescue_update on public.rescue_plans for update to authenticated
  using (plant_id in (select id from public.plants where home_id in (select private.managed_home_ids())));

-- Home-scoped tables: managers only.
create policy vacations_all on public.vacations for all to authenticated
  using (home_id in (select private.managed_home_ids()))
  with check (home_id in (select private.managed_home_ids()));
create policy shopping_all on public.shopping_items for all to authenticated
  using (home_id in (select private.managed_home_ids()))
  with check (home_id in (select private.managed_home_ids()));

-- Per-user tables.
create policy push_all on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy messenger_select on public.messenger_links for select to authenticated using (user_id = (select auth.uid()));
create policy messenger_delete on public.messenger_links for delete to authenticated using (user_id = (select auth.uid()));
create policy chat_select on public.chat_messages for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: private bucket, path '{home_id}/{plant_id}/{file}'
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plant-photos', 'plant-photos', false, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create policy plant_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'plant-photos' and (select private.has_plant_access(((storage.foldername(name))[2])::uuid)));
create policy plant_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'plant-photos' and (select private.has_plant_access(((storage.foldername(name))[2])::uuid)));
