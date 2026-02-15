-- Migration: Fix applicants RLS to use account_memberships
-- The old policy used company_members table which is outdated
-- New system uses account_memberships via is_company_member helper

-- ============================================================================
-- Update applicants RLS policies to use is_company_member helper
-- ============================================================================

-- Drop old policy that uses company_members
drop policy if exists "Members can view company applicants" on public.applicants;

-- Create new policy using is_company_member helper (uses account_memberships)
create policy "Members can view company applicants"
  on public.applicants
  for select
  using (public.is_company_member(company_id));

-- Also update the update policy
drop policy if exists "Owners and admins can update applicants" on public.applicants;

create policy "Members can update company applicants"
  on public.applicants
  for update
  using (public.is_company_member(company_id));

-- Add delete policy for admins
drop policy if exists "Admins can delete applicants" on public.applicants;

create policy "Admins can delete applicants"
  on public.applicants
  for delete
  using (public.is_company_admin(company_id));
