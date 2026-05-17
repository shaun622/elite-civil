-- Step 3: drawings + drawing_pages tables and the private "drawings" storage bucket.
-- See docs/takeoffmate-build-spec.md ("Data Model").

-- drawings -------------------------------------------------------------------

create table public.drawings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  original_filename text not null,
  file_path text not null,
  page_count integer not null check (page_count > 0),
  created_at timestamptz not null default now()
);

create index drawings_project_id_idx
  on public.drawings (project_id, created_at desc);

alter table public.drawings enable row level security;

create policy "Drawings are viewable by their owner"
  on public.drawings for select
  using (auth.uid() = user_id);

create policy "Drawings are insertable by their owner"
  on public.drawings for insert
  with check (auth.uid() = user_id);

create policy "Drawings are updatable by their owner"
  on public.drawings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Drawings are deletable by their owner"
  on public.drawings for delete
  using (auth.uid() = user_id);

-- drawing_pages --------------------------------------------------------------

create table public.drawing_pages (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.drawings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  page_number integer not null check (page_number > 0),
  image_path text not null,
  image_width integer not null check (image_width > 0),
  image_height integer not null check (image_height > 0),
  view_type text not null default 'unknown'
    check (view_type in ('plan', 'elevation', 'section', 'unknown')),
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'extracting', 'extracted', 'reviewed', 'failed')),
  extraction_error text,
  created_at timestamptz not null default now(),
  unique (drawing_id, page_number)
);

create index drawing_pages_drawing_id_idx
  on public.drawing_pages (drawing_id, page_number);

alter table public.drawing_pages enable row level security;

create policy "Drawing pages are viewable by their owner"
  on public.drawing_pages for select
  using (auth.uid() = user_id);

create policy "Drawing pages are insertable by their owner"
  on public.drawing_pages for insert
  with check (auth.uid() = user_id);

create policy "Drawing pages are updatable by their owner"
  on public.drawing_pages for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Drawing pages are deletable by their owner"
  on public.drawing_pages for delete
  using (auth.uid() = user_id);

-- Storage bucket + per-user folder policies ----------------------------------

insert into storage.buckets (id, name, public)
values ('drawings', 'drawings', false)
on conflict (id) do nothing;

create policy "Users read their own drawing files"
  on storage.objects for select
  using (
    bucket_id = 'drawings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users upload to their own drawing folder"
  on storage.objects for insert
  with check (
    bucket_id = 'drawings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users update their own drawing files"
  on storage.objects for update
  using (
    bucket_id = 'drawings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete their own drawing files"
  on storage.objects for delete
  using (
    bucket_id = 'drawings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
