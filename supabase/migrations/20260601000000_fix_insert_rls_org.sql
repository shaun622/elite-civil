-- ============================================================================
-- FIX: org-scoped INSERT policies rejected every insert (even for the owner).
--
-- The INSERT WITH CHECK used has_org_role(org_id, ...), but org_id is populated
-- by the set_org_id_from_user BEFORE-INSERT trigger — and the WITH CHECK is
-- evaluated with org_id still NULL (before the trigger's value is visible to
-- the policy in this setup), so has_org_role(NULL, ...) was always false.
--
-- Check the caller's own-org role via current_org_id() instead — that's
-- resolvable at check time from auth.uid(), with no dependency on the trigger.
-- The trigger still stamps org_id onto the stored row, so rows land in (and
-- stay visible to) the caller's org. Re-runnable.
-- ============================================================================

drop policy if exists "projects insert by editors" on public.projects;
create policy "projects insert by editors" on public.projects
  for insert
  with check (public.has_org_role(public.current_org_id(), array['owner','admin','editor']));

drop policy if exists "drawings insert by editors" on public.drawings;
create policy "drawings insert by editors" on public.drawings
  for insert
  with check (public.has_org_role(public.current_org_id(), array['owner','admin','editor']));

drop policy if exists "drawing_pages insert by editors" on public.drawing_pages;
create policy "drawing_pages insert by editors" on public.drawing_pages
  for insert
  with check (public.has_org_role(public.current_org_id(), array['owner','admin','editor']));

drop policy if exists "extractions insert by editors" on public.extractions;
create policy "extractions insert by editors" on public.extractions
  for insert
  with check (public.has_org_role(public.current_org_id(), array['owner','admin','editor']));

drop policy if exists "wall_segments insert by editors" on public.wall_segments;
create policy "wall_segments insert by editors" on public.wall_segments
  for insert
  with check (public.has_org_role(public.current_org_id(), array['owner','admin','editor']));

drop policy if exists "dimension_labels insert by editors" on public.dimension_labels;
create policy "dimension_labels insert by editors" on public.dimension_labels
  for insert
  with check (public.has_org_role(public.current_org_id(), array['owner','admin','editor']));
