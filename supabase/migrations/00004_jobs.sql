-- Migration: Create jobs table with RLS
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Jobs table
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  slug text not null,
  location text not null default '',
  terminal text not null default '',
  status text not null default 'open' check (
    status in ('open', 'paused', 'closed')
  ),
  created_at timestamptz not null default now()
);

-- 2. Indexes
create index jobs_company_id_idx on public.jobs(company_id);
create unique index jobs_company_slug_idx on public.jobs(company_id, slug);

-- 3. Enable RLS
alter table public.jobs enable row level security;

-- 4. RLS policies

-- All company members can read jobs
create policy "Members can view company jobs"
  on public.jobs for select
  using (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid()
    )
  );

-- Only owners and admins can insert jobs
create policy "Owners and admins can insert jobs"
  on public.jobs for insert
  with check (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Only owners and admins can update jobs
create policy "Owners and admins can update jobs"
  on public.jobs for update
  using (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );
