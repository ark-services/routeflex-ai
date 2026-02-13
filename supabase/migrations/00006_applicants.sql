-- Migration: Create applicants table with RLS and storage bucket
-- Run this in the Supabase SQL Editor

-- 1. Applicants table
create table public.applicants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text not null,
  terminal_preference text not null default '',
  experience text not null default '',
  resume_url text,
  status text not null default 'applied' check (
    status in ('applied', 'reviewing', 'interviewing', 'offer', 'hired', 'rejected')
  ),
  created_at timestamptz not null default now()
);

-- 2. Indexes
create index applicants_company_id_idx on public.applicants(company_id);
create index applicants_job_id_idx on public.applicants(job_id);

-- 3. Enable RLS
alter table public.applicants enable row level security;

-- 4. RLS policies

-- Allow anyone to insert applicants (public application)
create policy "Anyone can submit applications"
  on public.applicants for insert
  with check (true);

-- Company members can view applicants for their companies
create policy "Members can view company applicants"
  on public.applicants for select
  using (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid()
    )
  );

-- Only owners and admins can update applicants
create policy "Owners and admins can update applicants"
  on public.applicants for update
  using (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- 5. Storage bucket for resumes
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false);

-- 6. Storage policies

-- Allow anyone to upload resumes
create policy "Anyone can upload resumes"
  on storage.objects for insert
  with check (bucket_id = 'resumes');

-- Company members can view resumes for their company's applicants
create policy "Members can view company resumes"
  on storage.objects for select
  using (
    bucket_id = 'resumes' and
    exists (
      select 1 from public.applicants
      where applicants.resume_url = storage.objects.name
        and applicants.company_id in (
          select company_id from public.company_members
          where user_id = auth.uid()
        )
    )
  );
