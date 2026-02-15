-- Migration: Allow all company members to delete applicants
-- Previous policy only allowed admins; this causes delete failures for regular members
-- Since members can already view and update applicants, they should be able to delete too

-- Drop the restrictive admin-only delete policy
drop policy if exists "Admins can delete applicants" on public.applicants;

-- Create new policy: all members can delete applicants from their company
create policy "Members can delete company applicants"
  on public.applicants
  for delete
  using (
    exists (
      select 1
      from public.companies c
      inner join public.account_memberships am on am.account_id = c.account_id
      where c.id = applicants.company_id
        and am.user_id = auth.uid()
    )
  );

comment on policy "Members can delete company applicants" on public.applicants is
  'Allows all company members (not just admins) to delete applicants. Cascade deletes handle related records in applicant_field_values and board_cells.';
