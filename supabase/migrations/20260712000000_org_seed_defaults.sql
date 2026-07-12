-- ============================================================================
-- Organisations: new projects seed an all-zero pricing config instead of the
-- BE Landscapes template. Adding the column with DEFAULT FALSE stamps every
-- pre-existing organisation (and any created in the deploy-to-SQL gap) as
-- template behaviour; then we flip the default to TRUE so organisations created
-- from now on start zeroed. Re-runnable.
-- ============================================================================

alter table public.organizations
  add column if not exists seed_zero_config boolean not null default false;

comment on column public.organizations.seed_zero_config is
  'New projects seed an all-zero pricing config instead of the BE Landscapes template. True for organisations created after v1.0.10 shipped.';

alter table public.organizations
  alter column seed_zero_config set default true;
