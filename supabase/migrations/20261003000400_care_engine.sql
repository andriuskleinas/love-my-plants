-- Milestone 3: Today checklist ticks and daily digest bookkeeping.

-- A checklist tick points at one step ("action") of an AI assessment.
alter table public.care_events
  add column assessment_id uuid references public.assessments (id) on delete cascade,
  add column action_index smallint check (action_index between 0 and 2);
create unique index care_events_assessment_action_idx
  on public.care_events (assessment_id, action_index) where assessment_id is not null;

-- Unticking a checklist step deletes its event; other history is permanent.
create policy events_delete on public.care_events for delete to authenticated
  using (assessment_id is not null and (select private.has_plant_access(plant_id)));

-- Local date the last daily reminder was sent, so each user gets at most one per day.
alter table public.profiles add column last_digest_on date;
