-- Migration: Monday-style board columns with status labels (idempotent)
-- Creates: board_groups, board_columns, status_labels, applicant_cells

-- 1) Board groups table (Monday-style groups) - Create first since applicants will reference it
create table if not exists public.board_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists board_groups_company_id_idx on public.board_groups(company_id);
create index if not exists board_groups_sort_order_idx on public.board_groups(company_id, sort_order);

-- Enable RLS
alter table public.board_groups enable row level security;

drop policy if exists "Members can view company board groups" on public.board_groups;
create policy "Members can view company board groups"
  on public.board_groups
  for select
  using (
    company_id in (
      select company_id
      from public.company_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "Admins can manage board groups" on public.board_groups;
create policy "Admins can manage board groups"
  on public.board_groups
  for all
  using (
    company_id in (
      select company_id
      from public.company_members
      where user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- 2) Add group_id to applicants table
alter table public.applicants
  add column if not exists group_id uuid references public.board_groups(id) on delete set null;

create index if not exists applicants_group_id_idx on public.applicants(group_id);

-- 3) Board columns table (dynamic columns)
create table if not exists public.board_columns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  type text not null check (type in ('text', 'number', 'date', 'file', 'status')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists board_columns_company_id_idx on public.board_columns(company_id);
create index if not exists board_columns_sort_order_idx on public.board_columns(company_id, sort_order);

-- Enable RLS
alter table public.board_columns enable row level security;

drop policy if exists "Members can view company board columns" on public.board_columns;
create policy "Members can view company board columns"
  on public.board_columns
  for select
  using (
    company_id in (
      select company_id
      from public.company_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "Admins can manage board columns" on public.board_columns;
create policy "Admins can manage board columns"
  on public.board_columns
  for all
  using (
    company_id in (
      select company_id
      from public.company_members
      where user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- 4) Status labels table (for status-type columns)
create table if not exists public.status_labels (
  id uuid primary key default gen_random_uuid(),
  column_id uuid not null references public.board_columns(id) on delete cascade,
  label text not null,
  color text not null default '#6b7280',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists status_labels_column_id_idx on public.status_labels(column_id);

-- Enable RLS
alter table public.status_labels enable row level security;

drop policy if exists "Members can view status labels" on public.status_labels;
create policy "Members can view status labels"
  on public.status_labels
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

drop policy if exists "Admins can manage status labels" on public.status_labels;
create policy "Admins can manage status labels"
  on public.status_labels
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

-- 5) Applicant cells table (stores values for each applicant x column)
create table if not exists public.applicant_cells (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  column_id uuid not null references public.board_columns(id) on delete cascade,
  -- Store all values as jsonb for flexibility
  value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(applicant_id, column_id)
);

create index if not exists applicant_cells_applicant_id_idx on public.applicant_cells(applicant_id);
create index if not exists applicant_cells_column_id_idx on public.applicant_cells(column_id);

-- Enable RLS
alter table public.applicant_cells enable row level security;

drop policy if exists "Members can view applicant cells" on public.applicant_cells;
create policy "Members can view applicant cells"
  on public.applicant_cells
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

drop policy if exists "Admins can manage applicant cells" on public.applicant_cells;
create policy "Admins can manage applicant cells"
  on public.applicant_cells
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
