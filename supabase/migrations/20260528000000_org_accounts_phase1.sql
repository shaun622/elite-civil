-- ============================================================================
-- Company/team accounts — PHASE 1: foundation (schema + onboarding + backfill).
--
-- ADDITIVE and changes NO existing access rules. Every data table keeps its
-- current per-user RLS (auth.uid() = user_id), so the app keeps working exactly
-- as before. Phase 2 switches the data tables' RLS to org membership.
--
-- What this adds:
--   1. organizations / organization_members / organization_invites tables,
--      with a one-owner-per-org guarantee and immutable member user_id.
--   2. SECURITY DEFINER helpers (current_org_id / is_org_member / has_org_role)
--      — SECURITY DEFINER is REQUIRED so RLS policies that read
--      organization_members don't recurse (the classic Supabase footgun).
--   3. org_id on every data table, force-filled on INSERT by a trigger and
--      backfilled for existing rows (with a hard assertion that none are NULL).
--   4. One organization per existing user (Owner), all their data stamped.
--   5. Onboarding: a fresh signup joins a matching pending invite, else gets
--      its own organization (Owner).
--
-- Re-runnable: every trigger/policy is dropped-if-exists first.
-- Rollback script is at the very bottom (commented out).
--
-- SECURITY NOTE: the invite auto-join in handle_new_user matches on email. It
-- is safe ONLY while Supabase "Confirm email" is ON — an unconfirmed signup
-- that squats an invited address gets a dormant membership it cannot log in to
-- use; the real invitee (who receives the confirmation) is the one who gains
-- access. Phase 4 will additionally bind acceptance to the invite token.
-- ============================================================================

-- 1. Tables -----------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- RESTRICT: an owner's profile can't be deleted out from under an org that
  -- still has data/members. Ownership transfer (Phase 5) precedes deletion.
  owner_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'editor'
    check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  -- One company per account (locked decision) — a user is in only one org.
  unique (user_id)
);
create index if not exists organization_members_org_idx
  on public.organization_members (org_id);
-- Exactly one Owner per org (blocks an admin inserting a second owner).
create unique index if not exists organization_members_one_owner_idx
  on public.organization_members (org_id) where role = 'owner';

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role text not null default 'editor'
    check (role in ('admin', 'editor', 'viewer')),
  invited_by uuid references public.profiles (id) on delete set null,
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  unique (org_id, email)
);
create index if not exists organization_invites_email_idx
  on public.organization_invites (lower(email));

drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at
  before update on public.organizations
  for each row execute function public.touch_updated_at();

-- Member user_id is immutable — closes a seat-reassignment / account-capture
-- vector where an owner/admin rewrites a member row's user_id.
create or replace function public.forbid_member_userid_change()
returns trigger
language plpgsql as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'organization_members.user_id is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists members_forbid_userid_change on public.organization_members;
create trigger members_forbid_userid_change
  before update on public.organization_members
  for each row execute function public.forbid_member_userid_change();

-- 2. Membership helper functions (SECURITY DEFINER → no RLS recursion) -------

create or replace function public.current_org_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.organization_members
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_org_member(org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where org_id = org and user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(org uuid, roles text[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where org_id = org and user_id = auth.uid() and role = any(roles)
  );
$$;

revoke execute on function public.current_org_id() from public;
revoke execute on function public.is_org_member(uuid) from public;
revoke execute on function public.has_org_role(uuid, text[]) from public;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;

-- 3. RLS on the new tables (all policies dropped-if-exists for re-runnability) -

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;

-- organizations: any member reads; owner/admin rename. (Creation is done by the
-- SECURITY DEFINER onboarding trigger, so no client INSERT policy.)
drop policy if exists "org readable by members" on public.organizations;
create policy "org readable by members"
  on public.organizations for select
  using (public.is_org_member(id));

drop policy if exists "org updatable by owner or admin" on public.organizations;
create policy "org updatable by owner or admin"
  on public.organizations for update
  using (public.has_org_role(id, array['owner', 'admin']))
  with check (public.has_org_role(id, array['owner', 'admin']));

-- members: readable by anyone in the same org. Writes are owner/admin, but an
-- admin may not create, promote to, demote, or delete an OWNER row — only an
-- owner can touch owner rows (the `role <> 'owner'` guards the OLD row on
-- update/delete and the NEW row on insert/update).
drop policy if exists "members readable by same org" on public.organization_members;
create policy "members readable by same org"
  on public.organization_members for select
  using (public.is_org_member(org_id));

drop policy if exists "members insertable by owner or admin" on public.organization_members;
create policy "members insertable by owner or admin"
  on public.organization_members for insert
  with check (
    public.has_org_role(org_id, array['owner'])
    or (public.has_org_role(org_id, array['admin']) and role <> 'owner')
  );

drop policy if exists "members updatable by owner or admin" on public.organization_members;
create policy "members updatable by owner or admin"
  on public.organization_members for update
  using (
    public.has_org_role(org_id, array['owner'])
    or (public.has_org_role(org_id, array['admin']) and role <> 'owner')
  )
  with check (
    public.has_org_role(org_id, array['owner'])
    or (public.has_org_role(org_id, array['admin']) and role <> 'owner')
  );

drop policy if exists "members deletable by owner or admin" on public.organization_members;
create policy "members deletable by owner or admin"
  on public.organization_members for delete
  using (
    public.has_org_role(org_id, array['owner'])
    or (public.has_org_role(org_id, array['admin']) and role <> 'owner')
  );

-- invites: only owner/admin of the org can see or manage them.
drop policy if exists "invites manageable by owner or admin" on public.organization_invites;
create policy "invites manageable by owner or admin"
  on public.organization_invites for all
  using (public.has_org_role(org_id, array['owner', 'admin']))
  with check (public.has_org_role(org_id, array['owner', 'admin']));

-- 4. org_id on every data table (nullable in Phase 1; Phase 2 tightens) ------

alter table public.projects
  add column if not exists org_id uuid references public.organizations (id) on delete cascade;
alter table public.drawings
  add column if not exists org_id uuid references public.organizations (id) on delete cascade;
alter table public.drawing_pages
  add column if not exists org_id uuid references public.organizations (id) on delete cascade;
alter table public.extractions
  add column if not exists org_id uuid references public.organizations (id) on delete cascade;
alter table public.wall_segments
  add column if not exists org_id uuid references public.organizations (id) on delete cascade;
alter table public.dimension_labels
  add column if not exists org_id uuid references public.organizations (id) on delete cascade;

create index if not exists projects_org_id_idx on public.projects (org_id);
create index if not exists drawings_org_id_idx on public.drawings (org_id);
create index if not exists drawing_pages_org_id_idx on public.drawing_pages (org_id);
create index if not exists extractions_org_id_idx on public.extractions (org_id);
create index if not exists wall_segments_org_id_idx on public.wall_segments (org_id);
create index if not exists dimension_labels_org_id_idx on public.dimension_labels (org_id);

-- 5. Backfill: one org per existing user (Owner). Runs BEFORE the auto-fill
--    triggers so current_org_id() resolves for every existing user by the time
--    those triggers exist (no spurious "no organization" raise mid-migration).

with new_orgs as (
  insert into public.organizations (name, owner_id)
  select
    coalesce(nullif(trim(p.company_name), ''), split_part(p.email, '@', 1), 'My Company'),
    p.id
  from public.profiles p
  where not exists (
    select 1 from public.organization_members m where m.user_id = p.id
  )
  returning id, owner_id
)
insert into public.organization_members (org_id, user_id, role)
select id, owner_id, 'owner' from new_orgs
on conflict (user_id) do nothing;

-- Drop any org that lost its membership race to a concurrent onboarding.
delete from public.organizations o
where not exists (
  select 1 from public.organization_members m where m.org_id = o.id
);

-- 6. Onboarding: new signups join a pending invite, else get their own org.
--    Updated BEFORE the auto-fill triggers so a signup mid-migration still
--    receives a membership (and thus a resolvable org).

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.organization_invites%rowtype;
  v_org_id uuid;
  v_joined integer;
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.subscriptions (
    user_id, plan, status, drawings_limit, storage_bytes_limit
  )
  values (new.id, 'trial', 'trial', 3, 200 * 1024 * 1024)
  on conflict (user_id) do nothing;

  -- Most-recent unexpired, unaccepted invite for this email (safe only with
  -- email confirmation ON — see the SECURITY NOTE at the top of this file).
  select * into v_invite
  from public.organization_invites
  where lower(email) = lower(new.email)
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if v_invite.id is not null then
    insert into public.organization_members (org_id, user_id, role)
    values (v_invite.org_id, new.id, v_invite.role)
    on conflict (user_id) do nothing;
    get diagnostics v_joined = row_count;
    -- Only consume the invite if a membership was actually created.
    if v_joined > 0 then
      update public.organization_invites set accepted_at = now() where id = v_invite.id;
      return new;
    end if;
  end if;

  -- No usable invite → create their own company and make them the Owner
  -- (unless they somehow already have a membership).
  if not exists (
    select 1 from public.organization_members where user_id = new.id
  ) then
    insert into public.organizations (name, owner_id)
    values (
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
        split_part(new.email, '@', 1),
        'My Company'
      ),
      new.id
    )
    returning id into v_org_id;

    insert into public.organization_members (org_id, user_id, role)
    values (v_org_id, new.id, 'owner')
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- 7. Auto-fill org_id on every INSERT. For a logged-in caller it FORCES the
--    row into the caller's own org (ignoring any client-supplied org_id — a
--    spoofing guard) and raises rather than writing NULL. Service-role
--    (edge-function) inserts keep an explicitly-passed org_id. Created AFTER
--    memberships exist so it never raises for a legitimate existing user.

create or replace function public.set_org_id_from_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.org_id := public.current_org_id();
    if new.org_id is null then
      raise exception 'set_org_id_from_user: no organization for user %', auth.uid();
    end if;
  end if;
  -- Service-role inserts (auth.uid() null) keep whatever org_id was passed.
  return new;
end;
$$;

drop trigger if exists projects_set_org on public.projects;
create trigger projects_set_org before insert on public.projects
  for each row execute function public.set_org_id_from_user();
drop trigger if exists drawings_set_org on public.drawings;
create trigger drawings_set_org before insert on public.drawings
  for each row execute function public.set_org_id_from_user();
drop trigger if exists drawing_pages_set_org on public.drawing_pages;
create trigger drawing_pages_set_org before insert on public.drawing_pages
  for each row execute function public.set_org_id_from_user();
drop trigger if exists extractions_set_org on public.extractions;
create trigger extractions_set_org before insert on public.extractions
  for each row execute function public.set_org_id_from_user();
drop trigger if exists wall_segments_set_org on public.wall_segments;
create trigger wall_segments_set_org before insert on public.wall_segments
  for each row execute function public.set_org_id_from_user();
drop trigger if exists dimension_labels_set_org on public.dimension_labels;
create trigger dimension_labels_set_org before insert on public.dimension_labels
  for each row execute function public.set_org_id_from_user();

-- 8. Backfill org_id on existing rows (runs last, so it also catches any row
--    inserted before the triggers above existed). unique(user_id) makes each
--    join 1:1, so no fan-out or wrong-org stamping.

update public.projects t set org_id = m.org_id
  from public.organization_members m where m.user_id = t.user_id and t.org_id is null;
update public.drawings t set org_id = m.org_id
  from public.organization_members m where m.user_id = t.user_id and t.org_id is null;
update public.drawing_pages t set org_id = m.org_id
  from public.organization_members m where m.user_id = t.user_id and t.org_id is null;
update public.extractions t set org_id = m.org_id
  from public.organization_members m where m.user_id = t.user_id and t.org_id is null;
update public.wall_segments t set org_id = m.org_id
  from public.organization_members m where m.user_id = t.user_id and t.org_id is null;
update public.dimension_labels t set org_id = m.org_id
  from public.organization_members m where m.user_id = t.user_id and t.org_id is null;

-- 9. Prove the backfill left no gaps — hard-fail the migration if it did.

do $$
begin
  if exists (select 1 from public.projects where org_id is null)
     or exists (select 1 from public.drawings where org_id is null)
     or exists (select 1 from public.drawing_pages where org_id is null)
     or exists (select 1 from public.extractions where org_id is null)
     or exists (select 1 from public.wall_segments where org_id is null)
     or exists (select 1 from public.dimension_labels where org_id is null) then
    raise exception 'org_id backfill left NULL rows — investigate before Phase 2';
  end if;
end $$;

-- ============================================================================
-- ROLLBACK (run only to undo this migration). Uncomment and execute.
-- Restores the pre-Phase-1 handle_new_user (profile + trial subscription only).
-- ============================================================================
-- drop trigger if exists projects_set_org on public.projects;
-- drop trigger if exists drawings_set_org on public.drawings;
-- drop trigger if exists drawing_pages_set_org on public.drawing_pages;
-- drop trigger if exists extractions_set_org on public.extractions;
-- drop trigger if exists wall_segments_set_org on public.wall_segments;
-- drop trigger if exists dimension_labels_set_org on public.dimension_labels;
-- drop function if exists public.set_org_id_from_user();
-- alter table public.projects drop column if exists org_id;
-- alter table public.drawings drop column if exists org_id;
-- alter table public.drawing_pages drop column if exists org_id;
-- alter table public.extractions drop column if exists org_id;
-- alter table public.wall_segments drop column if exists org_id;
-- alter table public.dimension_labels drop column if exists org_id;
-- drop trigger if exists members_forbid_userid_change on public.organization_members;
-- drop function if exists public.forbid_member_userid_change();
-- drop table if exists public.organization_invites;
-- drop table if exists public.organization_members;
-- drop table if exists public.organizations;
-- drop function if exists public.current_org_id();
-- drop function if exists public.is_org_member(uuid);
-- drop function if exists public.has_org_role(uuid, text[]);
-- create or replace function public.handle_new_user()
-- returns trigger language plpgsql security definer set search_path = public as $$
-- begin
--   insert into public.profiles (id, email) values (new.id, new.email)
--     on conflict (id) do nothing;
--   insert into public.subscriptions (user_id, plan, status, drawings_limit, storage_bytes_limit)
--     values (new.id, 'trial', 'trial', 3, 200 * 1024 * 1024)
--     on conflict (user_id) do nothing;
--   return new;
-- end; $$;
