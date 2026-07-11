-- ============================================================================
-- Projects: human-readable URL slug (e.g. /projects/12-murray-street) derived
-- from the project name, unique WITHIN an organisation. Nullable so existing
-- rows and any insert made before the app deploy never fail. Re-runnable.
-- ============================================================================

alter table public.projects
  add column if not exists slug text;

-- Backfill a unique-per-org slug for every row that doesn't have one yet.
-- We loop row by row and, for each, pick the first candidate ("base", then
-- "base-2", "base-3", ...) that no OTHER project in the same org already holds
-- (whether pre-existing or assigned earlier in this same loop). Checking
-- against the whole per-org slug set — not just same-named siblings — is what
-- keeps a suffixed slug like "site-2" from clashing with a project literally
-- named "Site 2", which would otherwise make the unique index below fail.
do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  for r in
    select id, org_id, name
    from public.projects
    where slug is null
    order by org_id, created_at, id
  loop
    base := nullif(
      regexp_replace(
        regexp_replace(lower(trim(coalesce(r.name, ''))), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)', '', 'g'
      ),
      ''
    );
    if base is null then
      base := 'project';
    end if;

    candidate := base;
    n := 1;
    while exists (
      select 1
      from public.projects p
      where p.org_id is not distinct from r.org_id
        and p.id <> r.id
        and p.slug = candidate
    ) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;

    update public.projects set slug = candidate where id = r.id;
  end loop;
end $$;

-- One slug per org. New inserts from the app pre-check for a free slug, and
-- this index is the race-safe backstop (23505 -> the app retries with a
-- disambiguating suffix). Multiple NULL slugs per org stay allowed (Postgres
-- treats NULLs as distinct), so a partial rollout never trips it.
create unique index if not exists projects_org_slug_key
  on public.projects (org_id, slug);
