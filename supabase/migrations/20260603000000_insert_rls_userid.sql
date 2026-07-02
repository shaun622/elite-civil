-- ============================================================================
-- FIX (take 2): INSERT policies rejected all inserts.
--
-- The org-membership helper (has_org_role / current_org_id) evaluates to TRUE
-- for the owner in a SELECT, yet the identical expression as an INSERT
-- WITH CHECK rejected the row — the SECURITY DEFINER helper doesn't resolve
-- auth.uid() the same way inside an INSERT check here. Rather than fight that,
-- revert the six data tables' INSERT checks to the proven direct owner check
-- (user_id = auth.uid()) — exactly what worked before team accounts.
--
-- Org isolation is preserved: the set_org_id_from_user trigger still stamps
-- org_id onto the row (so it belongs to the caller's company), and SELECT /
-- UPDATE / DELETE still enforce org membership + role. The only relaxation is
-- that the editor+ role isn't checked at insert time (any member can create a
-- row in their own org); reads/edits remain role-gated. Re-runnable.
-- ============================================================================

drop policy if exists "projects insert by editors" on public.projects;
create policy "projects insert by editors" on public.projects
  for insert with check (user_id = auth.uid());

drop policy if exists "drawings insert by editors" on public.drawings;
create policy "drawings insert by editors" on public.drawings
  for insert with check (user_id = auth.uid());

drop policy if exists "drawing_pages insert by editors" on public.drawing_pages;
create policy "drawing_pages insert by editors" on public.drawing_pages
  for insert with check (user_id = auth.uid());

drop policy if exists "extractions insert by editors" on public.extractions;
create policy "extractions insert by editors" on public.extractions
  for insert with check (user_id = auth.uid());

drop policy if exists "wall_segments insert by editors" on public.wall_segments;
create policy "wall_segments insert by editors" on public.wall_segments
  for insert with check (user_id = auth.uid());

drop policy if exists "dimension_labels insert by editors" on public.dimension_labels;
create policy "dimension_labels insert by editors" on public.dimension_labels
  for insert with check (user_id = auth.uid());
