-- Migration: Ensure applicants UPDATE RLS policy is correct and add diagnostics
-- Problem: moveApplicant and bulkMoveApplicants silently fail (0 rows updated)
-- Root cause: Missing row count validation in server actions (code fix) + defensive RLS verification (this migration)

-- ============================================================================
-- STEP 1: Verify and recreate helper functions
-- ============================================================================

-- Recreate is_company_member to ensure it exists and works correctly
create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.companies c
    inner join public.account_memberships am on am.account_id = c.account_id
    where c.id = p_company_id
      and am.user_id = auth.uid()
  );
$$;

-- Ensure grants
grant execute on function public.is_company_member(uuid) to authenticated, anon;

comment on function public.is_company_member(uuid) is
  'Returns true if the current user (auth.uid()) is a member of the specified company via account_memberships';

-- ============================================================================
-- STEP 2: Drop and recreate UPDATE policy for applicants
-- ============================================================================

-- Drop all existing UPDATE policies
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'applicants'
      and cmd = 'UPDATE'
  loop
    execute format('drop policy if exists %I on public.applicants', pol.policyname);
    raise notice 'Dropped UPDATE policy: %', pol.policyname;
  end loop;
end $$;

-- Create UPDATE policy: all company members can update applicants
-- Using inline EXISTS for maximum transparency (same pattern as DELETE policy in 00022)
create policy "members_can_update_company_applicants"
  on public.applicants
  for update
  to authenticated
  using (
    -- User must be a member of the company that owns the applicant
    exists (
      select 1
      from public.companies c
      inner join public.account_memberships am on am.account_id = c.account_id
      where c.id = applicants.company_id
        and am.user_id = auth.uid()
    )
  );

comment on policy "members_can_update_company_applicants" on public.applicants is
  'Allows all company members to update applicants (move groups, change status, etc). Uses inline EXISTS for clarity. No with_check clause means any update value is allowed.';

-- ============================================================================
-- STEP 3: Verify RLS is enabled
-- ============================================================================

alter table public.applicants enable row level security;

-- ============================================================================
-- STEP 4: Diagnostic queries
-- ============================================================================

-- Run these queries in Supabase SQL Editor to verify:

-- Query 1: Check UPDATE policy exists
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'applicants' AND cmd = 'UPDATE';
-- Expected: 1 row with policyname = 'members_can_update_company_applicants'

-- Query 2: Test the EXISTS logic directly (replace UUIDs with real values)
-- SELECT EXISTS (
--   SELECT 1 FROM public.companies c
--   INNER JOIN public.account_memberships am ON am.account_id = c.account_id
--   WHERE c.id = 'your-company-id'::uuid AND am.user_id = auth.uid()
-- );
-- Expected: TRUE if you're a member

-- Query 3: Test UPDATE with row count (replace UUIDs with real values)
-- UPDATE public.applicants
-- SET group_id = 'new-group-id'::uuid
-- WHERE id = 'applicant-id'::uuid
--   AND company_id = 'company-id'::uuid
--   AND job_id = 'job-id'::uuid
-- RETURNING id;
-- Expected: 1 row returned if RLS passes
