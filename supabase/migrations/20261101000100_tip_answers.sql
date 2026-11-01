-- Answers to the AI's tips (one-off changes like "Move closer to the window"), so a tip the
-- owner has done, can't do, or put off doesn't keep coming back. The note ("this is the
-- sunniest spot in my home") is shown on the plant page and given to the next health check.

create type public.tip_answer as enum ('done', 'cant', 'later');

create table public.tip_answers (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  action_index smallint not null check (action_index between 0 and 2),
  -- The tip's taskType (light, repot, …): a "done" light tip quiets other light tips too.
  topic text not null,
  answer public.tip_answer not null,
  note text check (char_length(note) <= 300),
  answered_by uuid default auth.uid() references auth.users (id) on delete set null,
  answered_at timestamptz not null default now(),
  unique (assessment_id, action_index)
);
create index tip_answers_plant_id_answered_at_idx on public.tip_answers (plant_id, answered_at desc);
create index tip_answers_answered_by_idx on public.tip_answers (answered_by);

alter table public.tip_answers enable row level security;
-- Anyone who can see the plant can answer (and change an answer, e.g. "later" → "done").
create policy tip_answers_select on public.tip_answers for select to authenticated
  using ((select private.has_plant_access(plant_id)));
create policy tip_answers_insert on public.tip_answers for insert to authenticated
  with check ((select private.has_plant_access(plant_id)));
create policy tip_answers_update on public.tip_answers for update to authenticated
  using ((select private.has_plant_access(plant_id)))
  with check ((select private.has_plant_access(plant_id)));
create policy tip_answers_delete on public.tip_answers for delete to authenticated
  using ((select private.has_plant_access(plant_id)));
