-- ============================================================================
-- Per-project access (Phase P). Projects are company-wide by DEFAULT; a
-- project can be marked 'restricted', after which only owner/admin (who always
-- see everything) plus explicitly-added members can access it.
--
--   - projects.visibility: 'org' (default, whole company) | 'restricted'
--   - project_members: who can access a restricted project
--   - can_access_project(pid): the one access rule, reused by every table
--   - all six data tables' read+write policies now gate on project access
--   - only owner/admin may flip visibility or manage project_members
--
-- Depends on Phase 1 + Phase 2. Re-runnable (drop-if-exists). Rollback at end.
-- ============================================================================

-- 1. visibility flag (existing rows default to company-wide) -----------------
alter table public.projects
  add column if not exists visibility text not null default 'org'
    check (visibility in ('org', 'restricted'));

-- 2. project_members ---------------------------------------------------------
create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);
create index if not exists project_members_project_idx
  on public.project_members (project_id);
create index if not exists project_members_user_idx
  on public.project_members (user_id);
alter table public.project_members enable row level security;

-- 3. Access helpers (SECURITY DEFINER — encapsulate the rule, no recursion) ---

-- The one access rule. A project is accessible when the caller is an org
-- member AND (it's company-wide, OR they're owner/admin, OR they're an
-- explicitly-added project member).
create or replace function public.can_access_project(pid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = pid
      and public.is_org_member(p.org_id)
      and (
        p.visibility = 'org'
        or public.has_org_role(p.org_id, array['owner', 'admin'])
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = p.id and pm.user_id = auth.uid()
        )
      )
  );
$$;

-- Resolve a child row's owning project from its FK VALUE (not the child's own
-- id), so these work in both USING (existing row) and WITH CHECK (new row).
create or replace function public.project_org(pid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.projects where id = pid;
$$;

create or replace function public.project_of_drawing(did uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from public.drawings where id = did;
$$;

create or replace function public.project_of_drawing_page(page_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select d.project_id
  from public.drawings d
  join public.drawing_pages dp on dp.drawing_id = d.id
  where dp.id = page_id;
$$;

create or replace function public.project_of_extraction(ext_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select public.project_of_drawing_page(e.drawing_page_id)
  from public.extractions e where e.id = ext_id;
$$;

revoke execute on function public.can_access_project(uuid) from public;
revoke execute on function public.project_org(uuid) from public;
revoke execute on function public.project_of_drawing(uuid) from public;
revoke execute on function public.project_of_drawing_page(uuid) from public;
revoke execute on function public.project_of_extraction(uuid) from public;
grant execute on function public.can_access_project(uuid) to authenticated;
grant execute on function public.project_org(uuid) to authenticated;
grant execute on function public.project_of_drawing(uuid) to authenticated;
grant execute on function public.project_of_drawing_page(uuid) to authenticated;
grant execute on function public.project_of_extraction(uuid) to authenticated;

-- 4. Only owner/admin may change a project's visibility (editors can edit
--    takeoff data but not restrict/unrestrict a project). Enforced in the DB
--    so it can't be bypassed by a direct update.
create or replace function public.enforce_project_visibility_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.visibility is distinct from old.visibility
     and not public.has_org_role(new.org_id, array['owner', 'admin']) then
    raise exception 'only an owner or admin can change project visibility';
  end if;
  -- When a project becomes restricted, keep its creator on the access list so
  -- they don't get locked out of a takeoff they built.
  if new.visibility = 'restricted' and old.visibility is distinct from 'restricted'
     and new.user_id is not null then
    insert into public.project_members (project_id, user_id, added_by)
    values (new.id, new.user_id, auth.uid())
    on conflict (project_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_guard_visibility on public.projects;
create trigger projects_guard_visibility
  before update on public.projects
  for each row execute function public.enforce_project_visibility_change();

-- 5. project_members RLS: readable by anyone who can access the project;
--    managed only by owner/admin of the project's org.
drop policy if exists "project_members readable" on public.project_members;
create policy "project_members readable"
  on public.project_members for select
  using (public.can_access_project(project_id));

drop policy if exists "project_members manageable by owner or admin" on public.project_members;
create policy "project_members manageable by owner or admin"
  on public.project_members for all
  using (public.has_org_role(public.project_org(project_id), array['owner', 'admin']))
  with check (public.has_org_role(public.project_org(project_id), array['owner', 'admin']));

-- 6. Re-point the six data tables' SELECT to project access, and gate writes
--    on (writable org role) AND project access. INSERT keeps just the role
--    check: a new project defaults to 'org' visibility (accessible), and child
--    rows are inserted under a project the caller can already access.

-- projects --------------------------------------------------------
drop policy if exists "projects select by org members" on public.projects;
drop policy if exists "projects select by access" on public.projects;
create policy "projects select by access" on public.projects
  for select using (public.can_access_project(id));
drop policy if exists "projects update by editors" on public.projects;
create policy "projects update by editors" on public.projects
  for update
  using (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(id))
  with check (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(id));
drop policy if exists "projects delete by editors" on public.projects;
create policy "projects delete by editors" on public.projects
  for delete
  using (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(id));

-- drawings (has project_id) --------------------------------------
drop policy if exists "drawings select by org members" on public.drawings;
drop policy if exists "drawings select by access" on public.drawings;
create policy "drawings select by access" on public.drawings
  for select using (public.can_access_project(project_id));
drop policy if exists "drawings insert by editors" on public.drawings;
create policy "drawings insert by editors" on public.drawings
  for insert with check (
    public.has_org_role(org_id, array['owner','admin','editor'])
    and public.can_access_project(project_id));
drop policy if exists "drawings update by editors" on public.drawings;
create policy "drawings update by editors" on public.drawings
  for update using (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(project_id))
  with check (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(project_id));
drop policy if exists "drawings delete by editors" on public.drawings;
create policy "drawings delete by editors" on public.drawings
  for delete using (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(project_id));

-- drawing_pages (via drawing_id) ---------------------------------
drop policy if exists "drawing_pages select by org members" on public.drawing_pages;
drop policy if exists "drawing_pages select by access" on public.drawing_pages;
create policy "drawing_pages select by access" on public.drawing_pages
  for select using (public.can_access_project(public.project_of_drawing(drawing_id)));
drop policy if exists "drawing_pages insert by editors" on public.drawing_pages;
create policy "drawing_pages insert by editors" on public.drawing_pages
  for insert with check (
    public.has_org_role(org_id, array['owner','admin','editor'])
    and public.can_access_project(public.project_of_drawing(drawing_id)));
drop policy if exists "drawing_pages update by editors" on public.drawing_pages;
create policy "drawing_pages update by editors" on public.drawing_pages
  for update using (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(public.project_of_drawing(drawing_id)))
  with check (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(public.project_of_drawing(drawing_id)));
drop policy if exists "drawing_pages delete by editors" on public.drawing_pages;
create policy "drawing_pages delete by editors" on public.drawing_pages
  for delete using (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(public.project_of_drawing(drawing_id)));

-- extractions (via drawing_page_id) ------------------------------
drop policy if exists "extractions select by org members" on public.extractions;
drop policy if exists "extractions select by access" on public.extractions;
create policy "extractions select by access" on public.extractions
  for select using (public.can_access_project(public.project_of_drawing_page(drawing_page_id)));
drop policy if exists "extractions insert by editors" on public.extractions;
create policy "extractions insert by editors" on public.extractions
  for insert with check (
    public.has_org_role(org_id, array['owner','admin','editor'])
    and public.can_access_project(public.project_of_drawing_page(drawing_page_id)));
drop policy if exists "extractions update by editors" on public.extractions;
create policy "extractions update by editors" on public.extractions
  for update using (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(public.project_of_drawing_page(drawing_page_id)))
  with check (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(public.project_of_drawing_page(drawing_page_id)));
drop policy if exists "extractions delete by editors" on public.extractions;
create policy "extractions delete by editors" on public.extractions
  for delete using (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(public.project_of_drawing_page(drawing_page_id)));

-- wall_segments (has project_id) ---------------------------------
drop policy if exists "wall_segments select by org members" on public.wall_segments;
drop policy if exists "wall_segments select by access" on public.wall_segments;
create policy "wall_segments select by access" on public.wall_segments
  for select using (public.can_access_project(project_id));
drop policy if exists "wall_segments insert by editors" on public.wall_segments;
create policy "wall_segments insert by editors" on public.wall_segments
  for insert with check (
    public.has_org_role(org_id, array['owner','admin','editor'])
    and public.can_access_project(project_id));
drop policy if exists "wall_segments update by editors" on public.wall_segments;
create policy "wall_segments update by editors" on public.wall_segments
  for update using (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(project_id))
  with check (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(project_id));
drop policy if exists "wall_segments delete by editors" on public.wall_segments;
create policy "wall_segments delete by editors" on public.wall_segments
  for delete using (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(project_id));

-- dimension_labels (via extraction_id) ---------------------------
drop policy if exists "dimension_labels select by org members" on public.dimension_labels;
drop policy if exists "dimension_labels select by access" on public.dimension_labels;
create policy "dimension_labels select by access" on public.dimension_labels
  for select using (public.can_access_project(public.project_of_extraction(extraction_id)));
drop policy if exists "dimension_labels insert by editors" on public.dimension_labels;
create policy "dimension_labels insert by editors" on public.dimension_labels
  for insert with check (
    public.has_org_role(org_id, array['owner','admin','editor'])
    and public.can_access_project(public.project_of_extraction(extraction_id)));
drop policy if exists "dimension_labels update by editors" on public.dimension_labels;
create policy "dimension_labels update by editors" on public.dimension_labels
  for update using (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(public.project_of_extraction(extraction_id)))
  with check (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(public.project_of_extraction(extraction_id)));
drop policy if exists "dimension_labels delete by editors" on public.dimension_labels;
create policy "dimension_labels delete by editors" on public.dimension_labels
  for delete using (public.has_org_role(org_id, array['owner','admin','editor']) and public.can_access_project(public.project_of_extraction(extraction_id)));

-- ============================================================================
-- ROLLBACK (undo Phase P — back to plain org-wide access). Uncomment + run.
-- ============================================================================
-- drop trigger if exists projects_guard_visibility on public.projects;
-- drop function if exists public.enforce_project_visibility_change();
-- drop table if exists public.project_members;
-- alter table public.projects drop column if exists visibility;
-- drop function if exists public.can_access_project(uuid);
-- drop function if exists public.project_org(uuid);
-- drop function if exists public.project_of_drawing(uuid);
-- drop function if exists public.project_of_drawing_page(uuid);
-- drop function if exists public.project_of_extraction(uuid);
-- -- then re-create the Phase-2 org-membership SELECT/write policies on the six
-- -- tables (see 20260529000000_org_accounts_phase2.sql) to restore org-wide access.
