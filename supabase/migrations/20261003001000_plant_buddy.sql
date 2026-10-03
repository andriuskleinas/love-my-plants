-- Milestone 7: Plant Buddy chat and shopping list.

-- Chat has its own, larger daily allowance than photo checks.
alter table public.ai_usage add column chat_calls int not null default 0;

-- Where a shopping item came from, and when it was bought.
alter table public.shopping_items
  add column source text not null default 'manual' check (source in ('manual', 'chat', 'plan')),
  add column bought_at timestamptz;
