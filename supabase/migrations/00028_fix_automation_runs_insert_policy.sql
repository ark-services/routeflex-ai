-- Migration: Add INSERT policy for automation_runs table
-- Problem: Automations are triggered correctly but fail to log runs due to missing INSERT RLS policy
-- Root cause: Migration 00025 only created SELECT policy, not INSERT

-- ============================================================================
-- Add INSERT policy for automation_runs
-- ============================================================================

-- Drop existing policies first to ensure clean state
drop policy if exists "Members can view job automation runs" on public.automation_runs;
drop policy if exists "Members can insert job automation runs" on public.automation_runs;

-- Recreate SELECT policy
create policy "Members can view job automation runs"
  on public.automation_runs
  for select
  to authenticated
  using (
    -- User must be a member of the company that owns the job
    exists (
      select 1
      from public.jobs j
      inner join public.companies c on c.id = j.company_id
      inner join public.account_memberships am on am.account_id = c.account_id
      where j.id = automation_runs.job_id
        and am.user_id = auth.uid()
    )
  );

-- Create INSERT policy (CRITICAL - this was missing!)
create policy "Members can insert job automation runs"
  on public.automation_runs
  for insert
  to authenticated
  with check (
    -- User must be a member of the company that owns the job
    exists (
      select 1
      from public.jobs j
      inner join public.companies c on c.id = j.company_id
      inner join public.account_memberships am on am.account_id = c.account_id
      where j.id = automation_runs.job_id
        and am.user_id = auth.uid()
    )
    -- Ensure job_id belongs to company_id (data integrity)
    and exists (
      select 1
      from public.jobs
      where id = automation_runs.job_id
        and company_id = automation_runs.company_id
    )
  );

comment on policy "Members can insert job automation runs" on public.automation_runs is
  'Allows company members to insert automation run logs when automations execute. This is required for the automation engine to log execution history.';

-- Ensure RLS is enabled
alter table public.automation_runs enable row level security;

-- ============================================================================
-- Verification queries
-- ============================================================================

-- Query 1: Verify both policies exist
-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename = 'automation_runs'
-- ORDER BY cmd, policyname;
-- Expected: 2 rows (SELECT and INSERT policies)

-- Query 2: Test INSERT permission (replace UUIDs with real values)
-- INSERT INTO public.automation_runs (
--   company_id, job_id, automation_id, trigger_key,
--   subject_type, subject_id, payload, status
-- ) VALUES (
--   'your-company-id'::uuid,
--   'your-job-id'::uuid,
--   'your-automation-id'::uuid,
--   'board.status_changes_to',
--   'applicant',
--   'your-applicant-id'::uuid,
--   '{}'::jsonb,
--   'success'
-- ) RETURNING id;
-- Expected: Row inserted successfully if you're a company member
