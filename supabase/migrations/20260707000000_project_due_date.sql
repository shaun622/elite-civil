-- ============================================================================
-- Projects table: optional due/target date, shown + editable on the projects
-- list table. Nullable; existing project RLS policies already cover it.
-- Re-runnable.
-- ============================================================================

alter table public.projects
  add column if not exists due_date date;
