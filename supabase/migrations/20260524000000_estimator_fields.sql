-- Phase 2 of the BE Landscapes merge. Extends the schema so a single
-- wall_segments row carries both the PDF-measured fields (length_mm,
-- polyline, rl_pairs, etc.) and the BE estimator fields (lot label,
-- wall type / design / position) the pricing / cost-breakdown /
-- quotation pages need. Projects pick up the BE config blob plus the
-- side data they hold per project (tracking log, extra-over items, cost
-- overrides) and the customer fields used in the quotation.

-- Per-wall estimator fields. Nullable so PDF-measured walls can be saved
-- before a wall type / design is picked.
alter table wall_segments
  add column if not exists lot text,
  add column if not exists wall_type text,
  add column if not exists wall_design text,
  add column if not exists position text;

-- Project-level fields for the BE Landscapes pipeline.
-- `config` holds the full ProjectConfig (rates, materials prices,
-- post-size ranges, admin / markup) — left null until seeded, the
-- engine falls back to defaults for any project without one set.
-- `tracking_entries`, `extra_over_items`, `cost_overrides` are the side
-- data BE keeps per project, stored as JSONB so they can be edited /
-- versioned alongside the rest of the project row.
alter table projects
  add column if not exists quote_number text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists description text,
  add column if not exists config jsonb,
  add column if not exists tracking_entries jsonb not null default '[]'::jsonb,
  add column if not exists extra_over_items jsonb not null default '[]'::jsonb,
  add column if not exists cost_overrides jsonb not null default '{}'::jsonb;
