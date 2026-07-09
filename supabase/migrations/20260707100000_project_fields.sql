-- ============================================================================
-- Projects: takeoff workflow status + structured site address (street stays in
-- site_address; add city/state/postcode). All nullable; existing project RLS
-- covers them. Re-runnable.
-- ============================================================================

alter table public.projects
  add column if not exists takeoff_status text
    check (takeoff_status in ('not_started', 'in_progress', 'quoted', 'won', 'lost')),
  add column if not exists site_city text,
  add column if not exists site_state text,
  add column if not exists site_postcode text;
