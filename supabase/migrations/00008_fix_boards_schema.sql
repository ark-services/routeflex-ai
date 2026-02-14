-- Migration: Fix boards schema to match application requirements
-- Creates boards table and updates board_columns, renames tables to match code

-- 1) Create boards table if it doesn't exist
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists boards_company_id_idx on public.boards(company_id);
create index if not exists boards_company_id_name_idx on public.boards(company_id, name);

-- Enable RLS
alter table public.boards enable row level security;

drop policy if exists "Members can view company boards" on public.boards;
create policy "Members can view company boards"
  on public.boards
  for select
  using (
    company_id in (
      select company_id
      from public.company_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "Admins can manage boards" on public.boards;
create policy "Admins can manage boards"
  on public.boards
  for all
  using (
    company_id in (
      select company_id
      from public.company_members
      where user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- 2) Add board_id, is_system, and settings columns to board_columns if they don't exist
alter table public.board_columns
  add column if not exists board_id uuid references public.boards(id) on delete cascade;

alter table public.board_columns
  add column if not exists is_system boolean not null default false;

alter table public.board_columns
  add column if not exists settings jsonb not null default '{}';

create index if not exists board_columns_board_id_idx on public.board_columns(board_id);

-- 3) Rename status_labels to board_status_labels if it exists
do $$
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'status_labels') then
    if not exists (select from pg_tables where schemaname = 'public' and tablename = 'board_status_labels') then
      alter table public.status_labels rename to board_status_labels;
    end if;
  end if;
end $$;

-- 4) Create board_status_labels table if it doesn't exist (in case it was never created)
create table if not exists public.board_status_labels (
  id uuid primary key default gen_random_uuid(),
  column_id uuid not null references public.board_columns(id) on delete cascade,
  label text not null,
  color text not null default '#6b7280',
  sort_order int not null default 0
);

create index if not exists board_status_labels_column_id_idx on public.board_status_labels(column_id);

-- Enable RLS for board_status_labels
alter table public.board_status_labels enable row level security;

drop policy if exists "Members can view status labels" on public.board_status_labels;
create policy "Members can view status labels"
  on public.board_status_labels
  for select
  using (
    column_id in (
      select id
      from public.board_columns
      where company_id in (
        select company_id
        from public.company_members
        where user_id = auth.uid()
      )
    )
  );

drop policy if exists "Admins can manage status labels" on public.board_status_labels;
create policy "Admins can manage status labels"
  on public.board_status_labels
  for all
  using (
    column_id in (
      select id
      from public.board_columns
      where company_id in (
        select company_id
        from public.company_members
        where user_id = auth.uid()
          and role in ('owner', 'admin')
      )
    )
  );

-- 5) Rename applicant_cells to board_cells if it exists
do $$
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'applicant_cells') then
    if not exists (select from pg_tables where schemaname = 'public' and tablename = 'board_cells') then
      alter table public.applicant_cells rename to board_cells;
    end if;
  end if;
end $$;

-- 6) Create board_cells table if it doesn't exist (with correct column structure)
create table if not exists public.board_cells (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  column_id uuid not null references public.board_columns(id) on delete cascade,
  value_text text,
  value_number numeric,
  value_date date,
  value_status_label_id uuid references public.board_status_labels(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(applicant_id, column_id)
);

create index if not exists board_cells_applicant_id_idx on public.board_cells(applicant_id);
create index if not exists board_cells_column_id_idx on public.board_cells(column_id);

-- Enable RLS for board_cells
alter table public.board_cells enable row level security;

drop policy if exists "Members can view applicant cells" on public.board_cells;
create policy "Members can view applicant cells"
  on public.board_cells
  for select
  using (
    applicant_id in (
      select id
      from public.applicants
      where company_id in (
        select company_id
        from public.company_members
        where user_id = auth.uid()
      )
    )
  );

drop policy if exists "Admins can manage applicant cells" on public.board_cells;
create policy "Admins can manage applicant cells"
  on public.board_cells
  for all
  using (
    applicant_id in (
      select id
      from public.applicants
      where company_id in (
        select company_id
        from public.company_members
        where user_id = auth.uid()
          and role in ('owner', 'admin')
      )
    )
  );

-- 7) Drop the old value column from board_cells if it exists (from old schema)
do $$
begin
  if exists (
    select from information_schema.columns
    where table_schema = 'public'
      and table_name = 'board_cells'
      and column_name = 'value'
  ) then
    alter table public.board_cells drop column value;
  end if;
end $$;

-- 8) Remove created_at from board_status_labels if it exists (not needed per requirements)
-- We'll keep it for backwards compatibility, but the code doesn't rely on it
