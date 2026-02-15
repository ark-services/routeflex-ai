-- Migration: Fix board-related RLS policies to use account_memberships
-- This is a comprehensive, idempotent migration that:
-- 1. Ensures helper functions exist
-- 2. Updates all board-related table RLS policies
-- 3. Can be run multiple times safely

-- ============================================================================
-- PART 1: Ensure helper functions exist (idempotent)
-- ============================================================================

-- Function to check if user is a company member via account_memberships
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

-- Function to check if user is a company admin/owner via account_memberships
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

-- Grant execute permissions
grant execute on function public.is_company_member(uuid) to authenticated, anon;
grant execute on function public.is_company_admin(uuid) to authenticated, anon;

-- ============================================================================
-- PART 2: Fix boards table RLS policies
-- ============================================================================

-- Drop ALL existing policies for boards (handles multiple runs)
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'boards'
  loop
    execute format('drop policy if exists %I on public.boards', pol.policyname);
  end loop;
end $$;

-- Create new policies
create policy "Members can view company boards"
  on public.boards
  for select
  using (public.is_company_member(company_id));

create policy "Members can insert boards"
  on public.boards
  for insert
  with check (public.is_company_member(company_id));

create policy "Members can update boards"
  on public.boards
  for update
  using (public.is_company_member(company_id));

create policy "Admins can delete boards"
  on public.boards
  for delete
  using (public.is_company_admin(company_id));

-- ============================================================================
-- PART 3: Fix board_groups table RLS policies
-- ============================================================================

-- Drop ALL existing policies for board_groups
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'board_groups'
  loop
    execute format('drop policy if exists %I on public.board_groups', pol.policyname);
  end loop;
end $$;

-- Create new policies
create policy "Members can view company board groups"
  on public.board_groups
  for select
  using (public.is_company_member(company_id));

create policy "Members can insert board groups"
  on public.board_groups
  for insert
  with check (public.is_company_member(company_id));

create policy "Members can update board groups"
  on public.board_groups
  for update
  using (public.is_company_member(company_id));

create policy "Admins can delete board groups"
  on public.board_groups
  for delete
  using (public.is_company_admin(company_id));

-- ============================================================================
-- PART 4: Fix board_columns table RLS policies
-- ============================================================================

-- Drop ALL existing policies for board_columns
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'board_columns'
  loop
    execute format('drop policy if exists %I on public.board_columns', pol.policyname);
  end loop;
end $$;

-- Create new policies
create policy "Members can view company board columns"
  on public.board_columns
  for select
  using (public.is_company_member(company_id));

create policy "Members can insert board columns"
  on public.board_columns
  for insert
  with check (public.is_company_member(company_id));

create policy "Members can update board columns"
  on public.board_columns
  for update
  using (public.is_company_member(company_id));

create policy "Admins can delete board columns"
  on public.board_columns
  for delete
  using (public.is_company_admin(company_id));

-- ============================================================================
-- PART 5: Fix board_status_labels table RLS policies
-- ============================================================================

-- Drop ALL existing policies for board_status_labels
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'board_status_labels'
  loop
    execute format('drop policy if exists %I on public.board_status_labels', pol.policyname);
  end loop;
end $$;

-- Create new policies (joins through board_columns)
create policy "Members can view status labels"
  on public.board_status_labels
  for select
  using (
    column_id in (
      select id from public.board_columns
      where public.is_company_member(company_id)
    )
  );

create policy "Members can insert status labels"
  on public.board_status_labels
  for insert
  with check (
    column_id in (
      select id from public.board_columns
      where public.is_company_member(company_id)
    )
  );

create policy "Members can update status labels"
  on public.board_status_labels
  for update
  using (
    column_id in (
      select id from public.board_columns
      where public.is_company_member(company_id)
    )
  );

create policy "Admins can delete status labels"
  on public.board_status_labels
  for delete
  using (
    column_id in (
      select id from public.board_columns
      where public.is_company_admin(company_id)
    )
  );

-- ============================================================================
-- PART 6: Fix board_cells table RLS policies
-- ============================================================================

-- Drop ALL existing policies for board_cells
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'board_cells'
  loop
    execute format('drop policy if exists %I on public.board_cells', pol.policyname);
  end loop;
end $$;

-- Create new policies (joins through applicants)
create policy "Members can view applicant cells"
  on public.board_cells
  for select
  using (
    applicant_id in (
      select id from public.applicants
      where public.is_company_member(company_id)
    )
  );

create policy "Members can insert applicant cells"
  on public.board_cells
  for insert
  with check (
    applicant_id in (
      select id from public.applicants
      where public.is_company_member(company_id)
    )
  );

create policy "Members can update applicant cells"
  on public.board_cells
  for update
  using (
    applicant_id in (
      select id from public.applicants
      where public.is_company_member(company_id)
    )
  );

create policy "Admins can delete applicant cells"
  on public.board_cells
  for delete
  using (
    applicant_id in (
      select id from public.applicants
      where public.is_company_admin(company_id)
    )
  );

-- ============================================================================
-- PART 7: Comments for documentation
-- ============================================================================

comment on function public.is_company_member(uuid) is 'Check if current user is a member of the company via account_memberships. Used by RLS policies.';
comment on function public.is_company_admin(uuid) is 'Check if current user is an admin/owner of the company via account_memberships. Used by RLS policies.';

comment on table public.boards is 'Board definitions for organizing applicants. RLS uses is_company_member helper.';
comment on table public.board_groups is 'Groups within boards (like Monday.com groups). RLS uses is_company_member helper.';
comment on table public.board_columns is 'Custom columns for boards. RLS uses is_company_member helper.';
comment on table public.board_status_labels is 'Status labels for status-type columns. RLS uses is_company_member helper via board_columns join.';
comment on table public.board_cells is 'Cell values for applicants in custom columns. RLS uses is_company_member helper via applicants join.';
