-- Milestone 4: repot/feeding plan nudges and weekly check-in nudges.
alter table public.milestones add column notified_at timestamptz;
alter table public.profiles add column last_checkin_nudge_on date;
