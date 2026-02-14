-- Migration: Create applicants table with RLS and storage bucket (idempotent)
-- Run this in the Supabase SQL Editor

-- 1) Applicants table
create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text not null,
  terminal_preference text not null default '',
  experience text not null default '',
  -- IMPORTANT: store the storage object key here (e.g. "companyId/jobId/filename.pdf")
  resume_path text,
  status text not null default 'applied' check (
    status in ('applied', 'reviewing', 'interviewing', 'offer', 'hired', 'rejected')
  ),
  created_at timestamptz not null default now()
);

-- 2) Indexes
create index if not exists applicants_company_id_idx on public.applicants(company_id);
create index if not exists applicants_job_id_idx on public.applicants(job_id);

-- 3) Enable RLS
alter table public.applicants enable row level security;

-- 4) RLS policies (drop + recreate so re-running doesn't error)

drop policy if exists "Anyone can submit applications" on public.applicants;
create policy "Anyone can submit applications"
  on public.applicants
  for insert
  with check (true);

drop policy if exists "Members can view company applicants" on public.applicants;
create policy "Members can view company applicants"
  on public.applicants
  for select
  using (
    company_id in (
      select company_id
      from public.company_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "Owners and admins can update applicants" on public.applicants;
create policy "Owners and admins can update applicants"
  on public.applicants
  for update
  using (
    company_id in (
      select company_id
      from public.company_members
      where user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- 5) Storage bucket for resumes (safe to re-run)
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

-- 6) Storage policies
-- NOTE: These policies apply to storage.objects (RLS is managed by Supabase storage)

drop policy if exists "Anyone can upload resumes" on storage.objects;
create policy "Anyone can upload resumes"
  on storage.objects
  for insert
  with check (bucket_id = 'resumes');

drop policy if exists "Members can view company resumes" on storage.objects;
create policy "Members can view company resumes"
  on storage.objects
  for select
  using (
    bucket_id = 'resumes'
    and exists (
      select 1
      from public.applicants a
      where a.resume_path = storage.objects.name
        and a.company_id in (
          select company_id
          from public.company_members
          where user_id = auth.uid()
        )
    )
  );
