-- ============================================================================
-- Company/team accounts — PHASE 2: switch ACCESS from per-user to org.
--
-- Depends on Phase 1 (org tables, helpers, org_id columns all backfilled).
-- This flips the actual access rules:
--   A. Data tables (projects/drawings/drawing_pages/extractions/wall_segments/
--      dimension_labels): reads = any org member; writes = owner/admin/editor;
--      viewers are read-only. org_id can't be moved to another org.
--   B. Storage (drawings bucket): reads = any teammate in the same org;
--      uploads = your own folder (editor+); update/delete = editor+ same-org.
--   C. Company branding (name/address/logo) moves onto the organization so
--      the whole team shares one company profile on quotes.
--
--   Billing stays per-user until Phase 3.
--
-- Re-runnable (every policy dropped-if-exists). Rollback at the bottom.
-- ============================================================================

-- === A. Data-table RLS: per-user  →  org membership ========================

-- Helper note: has_org_role(org, ARRAY['owner','admin','editor']) = "can write".
-- SELECT uses is_org_member so viewers can read. WITH CHECK on the write
-- policies also pins the row to an org the caller can write, so org_id can't
-- be reassigned to another org.

-- projects --------------------------------------------------------
drop policy if exists "Projects are viewable by their owner" on public.projects;
drop policy if exists "Projects are insertable by their owner" on public.projects;
drop policy if exists "Projects are updatable by their owner" on public.projects;
drop policy if exists "Projects are deletable by their owner" on public.projects;
drop policy if exists "projects select by org members" on public.projects;
create policy "projects select by org members" on public.projects
  for select using (public.is_org_member(org_id));
drop policy if exists "projects insert by editors" on public.projects;
create policy "projects insert by editors" on public.projects
  for insert with check (public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists "projects update by editors" on public.projects;
create policy "projects update by editors" on public.projects
  for update using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check (public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists "projects delete by editors" on public.projects;
create policy "projects delete by editors" on public.projects
  for delete using (public.has_org_role(org_id, array['owner','admin','editor']));

-- drawings --------------------------------------------------------
drop policy if exists "Drawings are viewable by their owner" on public.drawings;
drop policy if exists "Drawings are insertable by their owner" on public.drawings;
drop policy if exists "Drawings are updatable by their owner" on public.drawings;
drop policy if exists "Drawings are deletable by their owner" on public.drawings;
drop policy if exists "drawings select by org members" on public.drawings;
create policy "drawings select by org members" on public.drawings
  for select using (public.is_org_member(org_id));
drop policy if exists "drawings insert by editors" on public.drawings;
create policy "drawings insert by editors" on public.drawings
  for insert with check (public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists "drawings update by editors" on public.drawings;
create policy "drawings update by editors" on public.drawings
  for update using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check (public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists "drawings delete by editors" on public.drawings;
create policy "drawings delete by editors" on public.drawings
  for delete using (public.has_org_role(org_id, array['owner','admin','editor']));

-- drawing_pages ---------------------------------------------------
drop policy if exists "Drawing pages are viewable by their owner" on public.drawing_pages;
drop policy if exists "Drawing pages are insertable by their owner" on public.drawing_pages;
drop policy if exists "Drawing pages are updatable by their owner" on public.drawing_pages;
drop policy if exists "Drawing pages are deletable by their owner" on public.drawing_pages;
drop policy if exists "drawing_pages select by org members" on public.drawing_pages;
create policy "drawing_pages select by org members" on public.drawing_pages
  for select using (public.is_org_member(org_id));
drop policy if exists "drawing_pages insert by editors" on public.drawing_pages;
create policy "drawing_pages insert by editors" on public.drawing_pages
  for insert with check (public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists "drawing_pages update by editors" on public.drawing_pages;
create policy "drawing_pages update by editors" on public.drawing_pages
  for update using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check (public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists "drawing_pages delete by editors" on public.drawing_pages;
create policy "drawing_pages delete by editors" on public.drawing_pages
  for delete using (public.has_org_role(org_id, array['owner','admin','editor']));

-- extractions -----------------------------------------------------
drop policy if exists "Extractions are viewable by their owner" on public.extractions;
drop policy if exists "Extractions are insertable by their owner" on public.extractions;
drop policy if exists "Extractions are updatable by their owner" on public.extractions;
drop policy if exists "Extractions are deletable by their owner" on public.extractions;
drop policy if exists "extractions select by org members" on public.extractions;
create policy "extractions select by org members" on public.extractions
  for select using (public.is_org_member(org_id));
drop policy if exists "extractions insert by editors" on public.extractions;
create policy "extractions insert by editors" on public.extractions
  for insert with check (public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists "extractions update by editors" on public.extractions;
create policy "extractions update by editors" on public.extractions
  for update using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check (public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists "extractions delete by editors" on public.extractions;
create policy "extractions delete by editors" on public.extractions
  for delete using (public.has_org_role(org_id, array['owner','admin','editor']));

-- wall_segments ---------------------------------------------------
drop policy if exists "Wall segments are viewable by their owner" on public.wall_segments;
drop policy if exists "Wall segments are insertable by their owner" on public.wall_segments;
drop policy if exists "Wall segments are updatable by their owner" on public.wall_segments;
drop policy if exists "Wall segments are deletable by their owner" on public.wall_segments;
drop policy if exists "wall_segments select by org members" on public.wall_segments;
create policy "wall_segments select by org members" on public.wall_segments
  for select using (public.is_org_member(org_id));
drop policy if exists "wall_segments insert by editors" on public.wall_segments;
create policy "wall_segments insert by editors" on public.wall_segments
  for insert with check (public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists "wall_segments update by editors" on public.wall_segments;
create policy "wall_segments update by editors" on public.wall_segments
  for update using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check (public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists "wall_segments delete by editors" on public.wall_segments;
create policy "wall_segments delete by editors" on public.wall_segments
  for delete using (public.has_org_role(org_id, array['owner','admin','editor']));

-- dimension_labels ------------------------------------------------
drop policy if exists "Dimensions are viewable by their owner" on public.dimension_labels;
drop policy if exists "Dimensions are insertable by their owner" on public.dimension_labels;
drop policy if exists "Dimensions are updatable by their owner" on public.dimension_labels;
drop policy if exists "Dimensions are deletable by their owner" on public.dimension_labels;
drop policy if exists "dimension_labels select by org members" on public.dimension_labels;
create policy "dimension_labels select by org members" on public.dimension_labels
  for select using (public.is_org_member(org_id));
drop policy if exists "dimension_labels insert by editors" on public.dimension_labels;
create policy "dimension_labels insert by editors" on public.dimension_labels
  for insert with check (public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists "dimension_labels update by editors" on public.dimension_labels;
create policy "dimension_labels update by editors" on public.dimension_labels
  for update using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check (public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists "dimension_labels delete by editors" on public.dimension_labels;
create policy "dimension_labels delete by editors" on public.dimension_labels
  for delete using (public.has_org_role(org_id, array['owner','admin','editor']));

-- === B. Storage: per-user folder  →  same-org access =======================

-- Map a "drawings" object's first path segment (the uploader's user_id) to an
-- org, guarding against non-UUID paths.
create or replace function public.storage_path_org(object_name text)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  seg text := (storage.foldername(object_name))[1];
  uid uuid;
begin
  begin
    uid := seg::uuid;
  exception when others then
    return null;
  end;
  return (select org_id from public.organization_members where user_id = uid);
end;
$$;

create or replace function public.can_read_org_file(object_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_org_member(public.storage_path_org(object_name));
$$;

create or replace function public.can_write_org_file(object_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_org_role(
    public.storage_path_org(object_name), array['owner','admin','editor']
  );
$$;

revoke execute on function public.storage_path_org(text) from public;
revoke execute on function public.can_read_org_file(text) from public;
revoke execute on function public.can_write_org_file(text) from public;
grant execute on function public.storage_path_org(text) to authenticated;
grant execute on function public.can_read_org_file(text) to authenticated;
grant execute on function public.can_write_org_file(text) to authenticated;

drop policy if exists "Users read their own drawing files" on storage.objects;
drop policy if exists "Users upload to their own drawing folder" on storage.objects;
drop policy if exists "Users update their own drawing files" on storage.objects;
drop policy if exists "Users delete their own drawing files" on storage.objects;

drop policy if exists "Org members read drawing files" on storage.objects;
create policy "Org members read drawing files"
  on storage.objects for select
  using (bucket_id = 'drawings' and public.can_read_org_file(name));

-- Uploads still go to the uploader's own folder, but only if they can write in
-- their org (viewers can't upload).
drop policy if exists "Members upload to their own drawing folder" on storage.objects;
create policy "Members upload to their own drawing folder"
  on storage.objects for insert
  with check (
    bucket_id = 'drawings'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_org_role(public.current_org_id(), array['owner','admin','editor'])
  );

-- USING scopes which existing files an editor may update (same org); WITH
-- CHECK pins the NEW name to the caller's own folder in a writable org, so an
-- editor can't rename a file into another org's namespace (storage.objects.name
-- is mutable — without this, USING alone would let the path be rewritten).
drop policy if exists "Editors update org drawing files" on storage.objects;
create policy "Editors update org drawing files"
  on storage.objects for update
  using (bucket_id = 'drawings' and public.can_write_org_file(name))
  with check (
    bucket_id = 'drawings'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_org_role(public.current_org_id(), array['owner','admin','editor'])
  );

drop policy if exists "Editors delete org drawing files" on storage.objects;
create policy "Editors delete org drawing files"
  on storage.objects for delete
  using (bucket_id = 'drawings' and public.can_write_org_file(name));

-- === C. Company branding on the organization ================================

alter table public.organizations
  add column if not exists company_name text,
  add column if not exists company_address text,
  add column if not exists company_logo_url text;

-- Seed each org's branding from its owner's existing per-user profile.
update public.organizations o
  set company_name     = coalesce(o.company_name, p.company_name),
      company_address  = coalesce(o.company_address, p.company_address),
      company_logo_url = coalesce(o.company_logo_url, p.company_logo_url)
  from public.profiles p
  where p.id = o.owner_id;

-- ============================================================================
-- ROLLBACK (undo Phase 2 — restores per-user access). Uncomment and run.
-- ============================================================================
-- -- storage: restore per-user folder policies
-- drop policy if exists "Org members read drawing files" on storage.objects;
-- drop policy if exists "Members upload to their own drawing folder" on storage.objects;
-- drop policy if exists "Editors update org drawing files" on storage.objects;
-- drop policy if exists "Editors delete org drawing files" on storage.objects;
-- create policy "Users read their own drawing files" on storage.objects for select
--   using (bucket_id='drawings' and (storage.foldername(name))[1] = auth.uid()::text);
-- create policy "Users upload to their own drawing folder" on storage.objects for insert
--   with check (bucket_id='drawings' and (storage.foldername(name))[1] = auth.uid()::text);
-- create policy "Users update their own drawing files" on storage.objects for update
--   using (bucket_id='drawings' and (storage.foldername(name))[1] = auth.uid()::text);
-- create policy "Users delete their own drawing files" on storage.objects for delete
--   using (bucket_id='drawings' and (storage.foldername(name))[1] = auth.uid()::text);
-- drop function if exists public.can_read_org_file(text);
-- drop function if exists public.can_write_org_file(text);
-- drop function if exists public.storage_path_org(text);
-- -- data tables: restore per-user policies (repeat the pattern for all six).
-- -- projects:
-- drop policy if exists "projects select by org members" on public.projects;
-- drop policy if exists "projects insert by editors" on public.projects;
-- drop policy if exists "projects update by editors" on public.projects;
-- drop policy if exists "projects delete by editors" on public.projects;
-- create policy "Projects are viewable by their owner" on public.projects for select using (auth.uid() = user_id);
-- create policy "Projects are insertable by their owner" on public.projects for insert with check (auth.uid() = user_id);
-- create policy "Projects are updatable by their owner" on public.projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- create policy "Projects are deletable by their owner" on public.projects for delete using (auth.uid() = user_id);
-- -- …repeat for drawings / drawing_pages / extractions / wall_segments / dimension_labels…
