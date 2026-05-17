-- Step 2: projects table + RLS + updated_at trigger.
-- See docs/takeoffmate-build-spec.md ("Data Model" -> projects).

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  client_name text,
  site_address text,
  status text not null default 'active'
    check (status in ('draft', 'active', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_id_idx
  on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

create policy "Projects are viewable by their owner"
  on public.projects
  for select
  using (auth.uid() = user_id);

create policy "Projects are insertable by their owner"
  on public.projects
  for insert
  with check (auth.uid() = user_id);

create policy "Projects are updatable by their owner"
  on public.projects
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Projects are deletable by their owner"
  on public.projects
  for delete
  using (auth.uid() = user_id);

create trigger projects_touch_updated_at
  before update on public.projects
  for each row
  execute function public.touch_updated_at();
