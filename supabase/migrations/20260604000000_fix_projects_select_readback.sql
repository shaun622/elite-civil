-- ============================================================================
-- ROOT CAUSE FIX: "new row violates row-level security policy for table
-- projects" on create — it was the READ-BACK, not the write.
--
-- createProject does .insert().select() → INSERT ... RETURNING, so Postgres
-- enforces the SELECT policy on the just-inserted row. The projects SELECT
-- policy was can_access_project(id) — a STABLE SECURITY DEFINER function that
-- RE-QUERIES public.projects by that id. During INSERT ... RETURNING the new
-- row isn't in that function's snapshot yet, so the self-lookup returns no row,
-- can_access_project() = false, and RETURNING raised the RLS violation. Every
-- earlier fix targeted the INSERT WITH CHECK, which was never the problem.
--
-- Fix: evaluate the projects SELECT rule from the row's OWN columns
-- (org_id / visibility / id) — no self-query of projects — so it resolves for
-- both existing rows and the in-flight RETURNING row. Restore the proper
-- role-checked INSERT policies the debugging detour had loosened.
--
-- The other five tables keep can_access_project(<parent>) on SELECT: they
-- reference an already-committed parent project, so no self-reference problem.
-- Re-runnable.
-- ============================================================================

-- Membership-in-a-specific-project check, SECURITY DEFINER so the projects
-- SELECT policy can consult project_members without tripping its RLS.
create or replace function public.is_project_member(pid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members
    where project_id = pid and user_id = auth.uid()
  );
$$;
revoke execute on function public.is_project_member(uuid) from public;
grant execute on function public.is_project_member(uuid) to authenticated;

-- projects SELECT: inline the access rule from the row's own columns ----------
drop policy if exists "projects select by access" on public.projects;
create policy "projects select by access" on public.projects
  for select using (
    public.is_org_member(org_id)
    and (
      visibility = 'org'
      or public.has_org_role(org_id, array['owner','admin'])
      or public.is_project_member(id)
    )
  );

-- projects INSERT: restore the writable-org-role check ------------------------
drop policy if exists "projects insert by editors" on public.projects;
create policy "projects insert by editors" on public.projects
  for insert
  with check (public.has_org_role(org_id, array['owner','admin','editor']));

-- Restore the proper INSERT checks on the five child tables (the earlier
-- user_id = auth.uid() detour dropped role + project-access enforcement).
-- Each references an already-committed parent project, so RETURNING is fine.
drop policy if exists "drawings insert by editors" on public.drawings;
create policy "drawings insert by editors" on public.drawings
  for insert with check (
    public.has_org_role(org_id, array['owner','admin','editor'])
    and public.can_access_project(project_id));

drop policy if exists "drawing_pages insert by editors" on public.drawing_pages;
create policy "drawing_pages insert by editors" on public.drawing_pages
  for insert with check (
    public.has_org_role(org_id, array['owner','admin','editor'])
    and public.can_access_project(public.project_of_drawing(drawing_id)));

drop policy if exists "extractions insert by editors" on public.extractions;
create policy "extractions insert by editors" on public.extractions
  for insert with check (
    public.has_org_role(org_id, array['owner','admin','editor'])
    and public.can_access_project(public.project_of_drawing_page(drawing_page_id)));

drop policy if exists "wall_segments insert by editors" on public.wall_segments;
create policy "wall_segments insert by editors" on public.wall_segments
  for insert with check (
    public.has_org_role(org_id, array['owner','admin','editor'])
    and public.can_access_project(project_id));

drop policy if exists "dimension_labels insert by editors" on public.dimension_labels;
create policy "dimension_labels insert by editors" on public.dimension_labels
  for insert with check (
    public.has_org_role(org_id, array['owner','admin','editor'])
    and public.can_access_project(public.project_of_extraction(extraction_id)));
