-- Per-wall RL stations.
--
-- A retaining wall's height varies along its length where the ground slopes,
-- so each wall keeps a list of {top, bottom} reduced-level pairs (rl_pairs),
-- entered by the user. The average of the per-pair heights is written to
-- wall_segments.height_mm so exports and area calcs are unchanged.

alter table wall_segments
  drop column if exists top_rl,
  drop column if exists bottom_rl,
  add column if not exists rl_pairs jsonb not null default '[]'::jsonb;
