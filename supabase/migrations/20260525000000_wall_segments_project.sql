-- Phase 3 of the BE Landscapes merge. wall_segments was scoped to an
-- extraction (one extraction per drawing page) — fine for the original
-- PDF measure flow, but the Take Off page needs to list every wall on
-- a project, regardless of which page (or no page) it came from. We
-- denormalize project_id onto wall_segments so the Take Off query is a
-- single index lookup, and we make extraction_id nullable so manually-
-- added walls (no PDF source) can exist.

-- Add project_id, nullable for the backfill window.
alter table wall_segments
  add column if not exists project_id uuid
    references public.projects (id) on delete cascade;

-- Backfill from the existing extraction -> drawing_page -> drawing chain.
-- Every wall already in the table got there via a PDF extraction, so we
-- can walk back to the owning project. Only rows that already have a
-- project_id are left alone.
update wall_segments ws
  set project_id = d.project_id
  from extractions e
  join drawing_pages dp on dp.id = e.drawing_page_id
  join drawings d on d.id = dp.drawing_id
  where ws.extraction_id = e.id
    and ws.project_id is null;

-- Drop the not-null constraint on extraction_id so manual walls (added
-- via the Take Off page, no PDF) can exist with project_id only. The
-- chain table data already has both set; new manual rows set only
-- project_id.
alter table wall_segments
  alter column extraction_id drop not null;

-- Index for the Take Off list query.
create index if not exists wall_segments_project_id_idx
  on wall_segments (project_id);
