-- Milestone 5: Plant ER rescue plans.
-- progress: { "<step index>": "<done at>" }; extra: { canBeSaved, fallback, checkinDays, symptoms, note }.
alter table public.rescue_plans
  add column progress jsonb not null default '{}',
  add column extra jsonb not null default '{}';

-- At most one active rescue per plant.
create unique index rescue_plans_one_active_idx on public.rescue_plans (plant_id) where ended_at is null;
