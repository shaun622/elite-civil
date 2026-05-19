-- Top / bottom reduced levels (RLs) per retaining wall.
--
-- Wall height is computed as (top_rl - bottom_rl) from values the user reads
-- off the drawing and enters by hand — exact arithmetic, far more reliable
-- than OCR of the small printed height numbers. The derived height is still
-- written to wall_segments.height_mm so exports and area calcs are unchanged.

alter table wall_segments
  add column if not exists top_rl numeric,
  add column if not exists bottom_rl numeric;
