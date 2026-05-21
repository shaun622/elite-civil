-- Per-wall reviewed flag. The user ticks Confirm on a wall once they've
-- verified the auto-read RLs (and any other edits) against the drawing,
-- which marks it with a green Confirmed badge in the review table.
alter table wall_segments
  add column if not exists confirmed boolean not null default false;
