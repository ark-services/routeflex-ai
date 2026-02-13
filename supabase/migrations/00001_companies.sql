-- Migration: Create companies + company_members with RLS
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Companies table
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 2. Company members table (join table: user <-> company)
create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

-- 3. Indexes
create index company_members_user_id_idx on public.company_members(user_id);
create index company_members_company_id_idx on public.company_members(company_id);

-- 4. Enable RLS
alter table public.companies enable row level security;
alter table public.company_members enable row level security;

-- 5. RLS policies for companies
-- Users can only see companies they are a member of
create policy "Users can view their companies"
  on public.companies for select
  using (
    id in (
      select company_id from public.company_members
      where user_id = auth.uid()
    )
  );

-- No insert/update/delete for companies via API (admin-only via dashboard/service role)

-- 6. RLS policies for company_members
-- Users can only see memberships for companies they belong to
create policy "Users can view members of their companies"
  on public.company_members for select
  using (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid()
    )
  );

-- No insert/update/delete for company_members via API (admin-only)
