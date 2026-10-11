-- Care logged from chat can be undone: a logged watering keeps the schedule it replaced
-- (learned factor, last watered, reminder), so Undo can put it back.
alter table public.care_events add column undo_state jsonb;
