-- Milestone 6: Care Circle invites, plant-sitters in Telegram, vacations.

-- A messenger chat belongs to an account (user) or to a plant-sitter without one (member).
alter table public.messenger_links
  alter column user_id drop not null,
  add column member_id uuid references public.home_members (id) on delete cascade,
  add constraint messenger_links_one_owner check ((user_id is null) <> (member_id is null));
create unique index messenger_links_member_platform_idx on public.messenger_links (member_id, platform) where member_id is not null;

alter table public.messenger_link_tokens
  alter column user_id drop not null,
  add column member_id uuid references public.home_members (id) on delete cascade,
  add constraint messenger_link_tokens_one_owner check ((user_id is null) <> (member_id is null));
create index messenger_link_tokens_member_id_idx on public.messenger_link_tokens (member_id);

-- Sitters' daily reminder bookkeeping (they have no profile).
alter table public.home_members add column last_digest_on date;

-- Who is travelling; their own reminders pause during the trip.
alter table public.vacations add column created_by uuid references auth.users (id) on delete cascade;
create index vacations_created_by_idx on public.vacations (created_by);
