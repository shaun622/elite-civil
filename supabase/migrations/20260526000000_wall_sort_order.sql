-- Lets the user drag-reorder walls and group them by lot on the Review
-- page, with the order persisted and carried through to Take Off /
-- Quotation. Grouping reuses the existing `lot` column (a group == a lot);
-- this just adds an explicit ordinal so the list isn't stuck in
-- created_at order.
--
-- `sort_order` is a per-wall integer, meaningful project-wide. Lower sorts
-- earlier. Null means "not yet ordered" — those fall back to created_at so
-- existing walls keep a stable order until the user drags something.

alter table wall_segments
  add column if not exists sort_order integer;

-- Seed existing rows so the first drag has a sane baseline to reorder from:
-- number them per project in creation order.
with ordered as (
  select
    id,
    row_number() over (
      partition by project_id
      order by created_at asc, id asc
    ) * 10 as rn
  from wall_segments
  where sort_order is null
)
update wall_segments ws
  set sort_order = ordered.rn
  from ordered
  where ws.id = ordered.id;

create index if not exists wall_segments_sort_order_idx
  on wall_segments (project_id, sort_order);
