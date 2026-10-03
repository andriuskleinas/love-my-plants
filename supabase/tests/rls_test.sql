-- RLS checks for the Care Circle (plan §7). Run against a database with the migration applied.
-- Raises an exception on the first failed expectation.
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'house@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'sitter@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'stranger@example.test');

-- Seed as superuser: two plants in the owner's home, plus memberships.
do $$
declare
  v_home uuid := (select home_id from public.home_members where user_id = '00000000-0000-0000-0000-00000000000a');
begin
  insert into public.plants (id, home_id, nickname, pot_diameter_cm) values
    ('11111111-0000-0000-0000-000000000001', v_home, 'Monty', 17),
    ('11111111-0000-0000-0000-000000000002', v_home, 'Fern-ando', 12);
  insert into public.home_members (home_id, user_id, display_name, role) values
    (v_home, '00000000-0000-0000-0000-00000000000b', 'House', 'household');
  insert into public.home_members (home_id, user_id, display_name, role, starts_at, ends_at, plant_scope) values
    (v_home, '00000000-0000-0000-0000-00000000000c', 'Ana', 'sitter', now() - interval '1 day', now() + interval '5 days',
     array['11111111-0000-0000-0000-000000000001'::uuid]);
end $$;

create function pg_temp.expect(label text, actual bigint, expected bigint) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL %: expected %, got %', label, expected, actual;
  end if;
  raise notice 'ok  %', label;
end $$;

set role authenticated;

-- Owner
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect('owner sees both plants', (select count(*) from public.plants), 2);
select pg_temp.expect('owner sees 3 circle members', (select count(*) from public.home_members), 3);

-- Household member
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect('household sees both plants', (select count(*) from public.plants), 2);
insert into public.plants (home_id, nickname, pot_diameter_cm)
  select id, 'Cacti', 8 from public.homes where created_by = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect('household can add a plant to the shared home', (select count(*) from public.plants), 3);

-- Sitter (active, scoped to Monty)
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect('sitter sees only scoped plant', (select count(*) from public.plants), 1);
insert into public.care_events (plant_id, type) values ('11111111-0000-0000-0000-000000000001', 'water');
select pg_temp.expect('sitter can log watering', (select count(*) from public.care_events), 1);
do $$ begin
  insert into public.care_events (plant_id, type) values ('11111111-0000-0000-0000-000000000002', 'water');
  raise exception 'FAIL sitter logged event on out-of-scope plant';
exception when insufficient_privilege then raise notice 'ok  sitter blocked on out-of-scope plant';
end $$;
do $$ begin
  insert into public.plants (home_id, nickname, pot_diameter_cm)
    select id, 'Sneaky', 10 from public.homes where created_by = '00000000-0000-0000-0000-00000000000a';
  raise exception 'FAIL sitter added a plant';
exception when insufficient_privilege then raise notice 'ok  sitter cannot add plants';
end $$;
select pg_temp.expect('sitter storage path allowed',
  (select count(*) from (select private.has_plant_access('11111111-0000-0000-0000-000000000001')) x where x.has_plant_access), 1);

-- Stranger
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect('stranger sees only own (empty) home plants', (select count(*) from public.plants), 0);
select pg_temp.expect('stranger sees only own membership', (select count(*) from public.home_members), 1);

-- Expired sitter
reset role;
update public.home_members set starts_at = now() - interval '10 days', ends_at = now() - interval '1 day'
  where user_id = '00000000-0000-0000-0000-00000000000c';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect('expired sitter sees nothing', (select count(*) from public.plants), 0);

reset role;
\echo ALL RLS TESTS PASSED
