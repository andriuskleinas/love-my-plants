-- Upserts can't target a partial unique index, so use a plain unique constraint.
-- NULLs are distinct, so non-checklist events (no assessment) never conflict.
drop index if exists public.care_events_assessment_action_idx;
alter table public.care_events
  add constraint care_events_assessment_action_key unique (assessment_id, action_index);
