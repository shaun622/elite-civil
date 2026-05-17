-- Initial schema: profiles table extending auth.users, RLS, and new-user trigger.
-- Aligned with TakeoffMate build spec (see docs/takeoffmate-build-spec.md, "Data Model").

create extension if not exists "pgcrypto";

-- profiles -------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  company_name text,
  company_logo_url text,
  company_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'User profile metadata. Extends auth.users; one row per Supabase Auth user.';

alter table public.profiles enable row level security;

create policy "Profiles are viewable by their owner"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "Profiles are insertable by their owner"
  on public.profiles
  for insert
  with check (auth.uid() = id);

create policy "Profiles are updatable by their owner"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- updated_at touch trigger ---------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row
  execute function public.touch_updated_at();

-- Auto-create a profile row when a Supabase auth user is created ------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
