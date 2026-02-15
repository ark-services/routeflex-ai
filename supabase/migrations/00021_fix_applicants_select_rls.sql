-- Migration: Fix applicants SELECT RLS policy
-- Problem: Authenticated company members cannot see applicants even though data exists
-- Root cause: RLS policy is blocking SELECT queries

-- ============================================================================
-- STEP 1: Verify helper function exists and works correctly
-- ============================================================================

-- Recreate is_company_member to ensure it exists and is correct
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

-- Ensure grants are correct
grant execute on function public.is_company_member(uuid) to authenticated, anon;

-- ============================================================================
-- STEP 2: Drop ALL existing SELECT policies on applicants
-- ============================================================================

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'applicants'
      and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.applicants', pol.policyname);
    raise notice 'Dropped policy: %', pol.policyname;
  end loop;
end $$;

-- ============================================================================
-- STEP 3: Create simple, correct SELECT policy
-- ============================================================================

-- Policy: Authenticated users can view applicants from their company
create policy "authenticated_users_can_view_company_applicants"
  on public.applicants
  for select
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

-- Alternative policy using helper function (commented out for now)
-- Uncomment if the inline version above works but you prefer using the helper
/*
create policy "authenticated_users_can_view_company_applicants"
  on public.applicants
  for select
  to authenticated
  using (public.is_company_member(company_id));
*/

-- ============================================================================
-- STEP 4: Ensure RLS is enabled
-- ============================================================================

alter table public.applicants enable row level security;

-- ============================================================================
-- STEP 5: Verify the policy works
-- ============================================================================

-- Test query (run as authenticated user in Supabase SQL Editor):
-- SELECT COUNT(*) as applicant_count FROM public.applicants WHERE company_id = 'your-company-id';

comment on policy "authenticated_users_can_view_company_applicants" on public.applicants is
  'Allows authenticated users to view applicants from companies they are members of via account_memberships';

-- ============================================================================
-- STEP 6: Diagnostic queries to verify setup
-- ============================================================================

-- Run these queries in Supabase SQL Editor to verify:

-- Query 1: Check if policy was created
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'applicants' AND cmd = 'SELECT';

-- Query 2: Test the helper function directly
-- SELECT public.is_company_member('your-company-id'::uuid);
-- Should return TRUE if you're a member

-- Query 3: Test the inline EXISTS logic
-- SELECT EXISTS (
--   SELECT 1 FROM public.companies c
--   INNER JOIN public.account_memberships am ON am.account_id = c.account_id
--   WHERE c.id = 'your-company-id'::uuid AND am.user_id = auth.uid()
-- );
-- Should also return TRUE

-- Query 4: Count applicants (with RLS enforced)
-- SELECT COUNT(*) FROM public.applicants WHERE company_id = 'your-company-id';
-- Should return count > 0 if applicants exist and RLS is working
