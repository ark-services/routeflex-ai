-- Migration: Fix Form Engine RLS Policies
-- Fixes RLS policies to use account_memberships instead of company_members
-- and ensures proper access control for form engine tables

-- ============================================================================
-- PART 1: Helper function to check if user is a company member via account
-- ============================================================================

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

create or replace function public.is_company_admin(p_company_id uuid)
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
      and am.role in ('owner', 'admin')
  );
$$;

-- ============================================================================
-- PART 2: Fix job_application_forms RLS policies
-- ============================================================================

-- Drop old policies
drop policy if exists "Members can view company forms" on public.job_application_forms;
drop policy if exists "Admins can manage forms" on public.job_application_forms;

-- Policy: Members can view their company's forms
create policy "Members can view company forms"
  on public.job_application_forms
  for select
  using (public.is_company_member(company_id));

-- Policy: Members can insert forms (needed for job creation)
create policy "Members can insert company forms"
  on public.job_application_forms
  for insert
  with check (public.is_company_member(company_id));

-- Policy: Admins can update forms
create policy "Admins can update company forms"
  on public.job_application_forms
  for update
  using (public.is_company_admin(company_id));

-- Policy: Admins can delete forms
create policy "Admins can delete company forms"
  on public.job_application_forms
  for delete
  using (public.is_company_admin(company_id));

-- ============================================================================
-- PART 3: Fix job_application_fields RLS policies
-- ============================================================================

-- Drop old policies
drop policy if exists "Members can view form fields" on public.job_application_fields;
drop policy if exists "Admins can manage form fields" on public.job_application_fields;

-- Policy: Members can view fields for their company's forms
create policy "Members can view form fields"
  on public.job_application_fields
  for select
  using (
    form_id in (
      select id from public.job_application_forms
      where public.is_company_member(company_id)
    )
  );

-- Policy: Members can insert fields
create policy "Members can insert form fields"
  on public.job_application_fields
  for insert
  with check (
    form_id in (
      select id from public.job_application_forms
      where public.is_company_member(company_id)
    )
  );

-- Policy: Members can update fields
create policy "Members can update form fields"
  on public.job_application_fields
  for update
  using (
    form_id in (
      select id from public.job_application_forms
      where public.is_company_member(company_id)
    )
  );

-- Policy: Admins can delete fields
create policy "Admins can delete form fields"
  on public.job_application_fields
  for delete
  using (
    form_id in (
      select id from public.job_application_forms
      where public.is_company_admin(company_id)
    )
  );

-- ============================================================================
-- PART 4: Fix applicant_field_values RLS policies
-- ============================================================================

-- Drop old policies
drop policy if exists "Anyone can submit field values" on public.applicant_field_values;
drop policy if exists "Members can view field values" on public.applicant_field_values;
drop policy if exists "Admins can manage field values" on public.applicant_field_values;

-- Policy: Anyone can insert field values (public form submission)
create policy "Anyone can submit field values"
  on public.applicant_field_values
  for insert
  with check (true);

-- Policy: Members can view field values for their company's applicants
create policy "Members can view field values"
  on public.applicant_field_values
  for select
  using (
    applicant_id in (
      select id from public.applicants
      where public.is_company_member(company_id)
    )
  );

-- Policy: Members can update field values
create policy "Members can update field values"
  on public.applicant_field_values
  for update
  using (
    applicant_id in (
      select id from public.applicants
      where public.is_company_member(company_id)
    )
  );

-- Policy: Admins can delete field values
create policy "Admins can delete field values"
  on public.applicant_field_values
  for delete
  using (
    applicant_id in (
      select id from public.applicants
      where public.is_company_admin(company_id)
    )
  );

-- ============================================================================
-- PART 5: Grant execute permissions on helper functions
-- ============================================================================

grant execute on function public.is_company_member(uuid) to authenticated, anon;
grant execute on function public.is_company_admin(uuid) to authenticated, anon;

-- ============================================================================
-- PART 6: Comments for documentation
-- ============================================================================

comment on function public.is_company_member(uuid) is 'Check if current user is a member of the company via account_memberships';
comment on function public.is_company_admin(uuid) is 'Check if current user is an admin/owner of the company via account_memberships';
