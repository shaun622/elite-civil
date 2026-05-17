-- Step 4: extractions, wall_segments, dimension_labels tables.
-- See docs/takeoffmate-build-spec.md ("Data Model" and "Extraction System Prompt").

-- extractions ----------------------------------------------------------------

create table public.extractions (
  id uuid primary key default gen_random_uuid(),
  drawing_page_id uuid not null unique
    references public.drawing_pages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  raw_response jsonb not null,
  scale_text text,
  scale_bbox jsonb,
  units text not null default 'unknown'
    check (units in ('mm', 'm', 'ft', 'in', 'unknown')),
  view_type text not null default 'unknown'
    check (view_type in ('plan', 'elevation', 'section', 'unknown')),
  overall_confidence numeric(4, 3),
  warnings jsonb not null default '[]'::jsonb,
  reviewed boolean not null default false,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index extractions_user_id_idx on public.extractions (user_id);

alter table public.extractions enable row level security;

create policy "Extractions are viewable by their owner"
  on public.extractions for select using (auth.uid() = user_id);
create policy "Extractions are insertable by their owner"
  on public.extractions for insert with check (auth.uid() = user_id);
create policy "Extractions are updatable by their owner"
  on public.extractions for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "Extractions are deletable by their owner"
  on public.extractions for delete using (auth.uid() = user_id);

create trigger extractions_touch_updated_at
  before update on public.extractions
  for each row execute function public.touch_updated_at();

-- wall_segments --------------------------------------------------------------

create table public.wall_segments (
  id uuid primary key default gen_random_uuid(),
  extraction_id uuid not null references public.extractions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_id text not null,
  label text,
  length_mm numeric,
  height_mm numeric,
  thickness_mm numeric,
  polyline jsonb not null default '[]'::jsonb,
  label_bbox jsonb,
  source_dimension_ids jsonb not null default '[]'::jsonb,
  confidence numeric(4, 3) not null default 0,
  notes text,
  user_edited boolean not null default false,
  original_values jsonb,
  user_added boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wall_segments_extraction_id_idx
  on public.wall_segments (extraction_id);

alter table public.wall_segments enable row level security;

create policy "Wall segments are viewable by their owner"
  on public.wall_segments for select using (auth.uid() = user_id);
create policy "Wall segments are insertable by their owner"
  on public.wall_segments for insert with check (auth.uid() = user_id);
create policy "Wall segments are updatable by their owner"
  on public.wall_segments for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "Wall segments are deletable by their owner"
  on public.wall_segments for delete using (auth.uid() = user_id);

create trigger wall_segments_touch_updated_at
  before update on public.wall_segments
  for each row execute function public.touch_updated_at();

-- dimension_labels -----------------------------------------------------------

create table public.dimension_labels (
  id uuid primary key default gen_random_uuid(),
  extraction_id uuid not null references public.extractions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_id text not null,
  text_raw text not null,
  value_normalized_mm numeric,
  bbox jsonb not null,
  confidence numeric(4, 3) not null default 0,
  applies_to_segment_id uuid references public.wall_segments (id) on delete set null,
  created_at timestamptz not null default now()
);

create index dimension_labels_extraction_id_idx
  on public.dimension_labels (extraction_id);

alter table public.dimension_labels enable row level security;

create policy "Dimensions are viewable by their owner"
  on public.dimension_labels for select using (auth.uid() = user_id);
create policy "Dimensions are insertable by their owner"
  on public.dimension_labels for insert with check (auth.uid() = user_id);
create policy "Dimensions are updatable by their owner"
  on public.dimension_labels for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "Dimensions are deletable by their owner"
  on public.dimension_labels for delete using (auth.uid() = user_id);
