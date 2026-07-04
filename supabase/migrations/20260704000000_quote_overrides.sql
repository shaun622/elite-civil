-- ============================================================================
-- Fully editable Quotation: per-project display-only overrides for the
-- customer-facing quote (custom line text, hidden lines, added lines, editable
-- summary + boilerplate sections). Numeric per-line rate/qty overrides continue
-- to live in cost_overrides ("quote_rate:" / "quote_qty:"). This column holds
-- everything non-numeric. None of it feeds the engine / Take Off / Materials
-- Order / Cost Breakdown — it is read only by the Quotation page.
-- Re-runnable.
-- ============================================================================

alter table public.projects
  add column if not exists quote_overrides jsonb not null default '{}'::jsonb;
