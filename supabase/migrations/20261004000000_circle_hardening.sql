-- Security fix: household members could edit the owner's membership (demote or detach
-- the owner) and attach arbitrary accounts to a home.

-- Managers may edit other members, never the owner's row.
drop policy members_update on public.home_members;
create policy members_update on public.home_members for update to authenticated
  using (home_id in (select private.managed_home_ids()) and role <> 'owner')
  with check (home_id in (select private.managed_home_ids()) and role <> 'owner');

-- Invites create unclaimed slots only; accounts are attached server-side when an invite is accepted.
drop policy members_insert on public.home_members;
create policy members_insert on public.home_members for insert to authenticated
  with check (home_id in (select private.managed_home_ids()) and role <> 'owner' and user_id is null);

-- Which account or home a membership belongs to can't be changed by users at all.
revoke update on public.home_members from authenticated;
grant update (display_name, role, starts_at, ends_at, plant_scope, invite_token_hash) on public.home_members to authenticated;
