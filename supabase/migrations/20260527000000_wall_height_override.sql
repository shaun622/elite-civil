-- Lets the user manually override a wall's height (they often round the
-- RL-derived average up to a cleaner figure) while keeping the real
-- average visible as a reference.
--
-- `height_mm` stays the EFFECTIVE height everything reads (engine, Take
-- Off m², height bands) — the app maintains it as
-- `height_override_mm ?? average(rl_pairs)`. `height_override_mm` records
-- the manual value when set (null = use the RL average). The average
-- itself is derived live from rl_pairs, so it isn't stored.

alter table wall_segments
  add column if not exists height_override_mm numeric;
