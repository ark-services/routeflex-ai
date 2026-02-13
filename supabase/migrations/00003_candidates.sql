-- Migration: Create candidates table with RLS
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Candidates table
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  stage text not null default 'Applied' check (
    stage in ('Applied', 'First Advantage', 'Interviewing', 'TSA', 'HR Paperwork', 'Hired', 'Rejected')
  ),
  created_at timestamptz not null default now()
);

-- 2. Indexes
create index candidates_company_id_idx on public.candidates(company_id);
create index candidates_stage_idx on public.candidates(company_id, stage);

-- 3. Enable RLS
alter table public.candidates enable row level security;

-- 4. RLS policies

-- All company members can read candidates
create policy "Members can view company candidates"
  on public.candidates for select
  using (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid()
    )
  );

-- Only owners and admins can insert candidates
create policy "Owners and admins can insert candidates"
  on public.candidates for insert
  with check (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Only owners and admins can update candidates
create policy "Owners and admins can update candidates"
  on public.candidates for update
  using (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );
