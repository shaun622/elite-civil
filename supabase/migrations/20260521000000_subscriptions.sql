-- Step 9: subscriptions + storage byte tracking + new-user trigger update.

-- 1. Add byte tracking to drawings + drawing_pages so we can enforce storage
--    limits without scanning storage.objects on every check.

alter table public.drawings
  add column if not exists bytes bigint not null default 0;

alter table public.drawing_pages
  add column if not exists bytes bigint not null default 0;

-- 2. subscriptions ------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'trial'
    check (plan in ('trial', 'starter', 'pro')),
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'cancelled', 'incomplete')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  drawings_used_this_period integer not null default 0,
  drawings_limit integer,
  storage_bytes_limit bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_stripe_customer_idx
  on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

create policy "Subscriptions readable by owner"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Inserts and updates happen via the service role (edge functions); the
-- client only reads. We still write a permissive update policy so the
-- usage counter in extract-drawing can bump it under the user's JWT.
create policy "Subscriptions updatable by owner"
  on public.subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Subscriptions insertable by owner"
  on public.subscriptions for insert
  with check (auth.uid() = user_id);

create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- 3. Extend the new-user trigger so every profile gets a trial subscription.

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

  insert into public.subscriptions (
    user_id,
    plan,
    status,
    drawings_limit,
    storage_bytes_limit
  )
  values (
    new.id,
    'trial',
    'trial',
    3,
    200 * 1024 * 1024  -- 200 MB
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- 4. Backfill subscriptions for any users created before this migration.

insert into public.subscriptions (
  user_id, plan, status, drawings_limit, storage_bytes_limit
)
select
  p.id,
  'trial',
  'trial',
  3,
  200 * 1024 * 1024
from public.profiles p
left join public.subscriptions s on s.user_id = p.id
where s.id is null;

-- 5. Useful aggregate view for storage usage. Wraps the SUMs so client/edge
--    code can query a single row.

create or replace view public.user_storage_usage as
select
  d.user_id,
  coalesce(sum(d.bytes), 0)::bigint as drawing_bytes,
  coalesce(
    (select sum(dp.bytes)
       from public.drawing_pages dp
       where dp.user_id = d.user_id),
    0
  )::bigint as page_bytes,
  (
    coalesce(sum(d.bytes), 0) +
    coalesce(
      (select sum(dp.bytes)
         from public.drawing_pages dp
         where dp.user_id = d.user_id),
      0
    )
  )::bigint as total_bytes
from public.drawings d
group by d.user_id;

grant select on public.user_storage_usage to authenticated;
