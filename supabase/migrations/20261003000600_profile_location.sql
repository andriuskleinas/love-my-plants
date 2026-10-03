-- Approximate home location (rounded to ~1 km) for daylight-aware care.
-- Only the area is stored, never the street address the user typed.
alter table public.profiles
  add column latitude numeric(5, 2) check (latitude between -90 and 90),
  add column longitude numeric(6, 2) check (longitude between -180 and 180),
  add column location_name text check (char_length(location_name) <= 120);
