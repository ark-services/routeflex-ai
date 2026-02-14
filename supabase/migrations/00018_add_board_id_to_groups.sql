-- Migration: Add board_id to board_groups and make boards job-scoped
-- This fixes the schema mismatch where code expects board_groups.board_id but it doesn't exist

-- ============================================================================
-- PART 1: Add board_id to board_groups
-- ============================================================================

do $$
begin
  if not exists (
    select from information_schema.columns
    where table_schema = 'public'
      and table_name = 'board_groups'
      and column_name = 'board_id'
  ) then
    -- Add the column
    alter table public.board_groups add column board_id uuid references public.boards(id) on delete cascade;

    -- Create index for performance
    create index board_groups_board_id_idx on public.board_groups(board_id);

    -- Create unique constraint to prevent duplicate groups per board
    create unique index board_groups_board_name_unique_idx
      on public.board_groups(board_id, name)
      where board_id is not null;
  end if;
end $$;

-- ============================================================================
-- PART 2: Ensure unique constraint on boards(job_id) exists
-- ============================================================================

-- This allows upsert with ON CONFLICT (job_id) for idempotency
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'boards'
      and indexname = 'boards_job_id_unique_idx'
  ) then
    create unique index boards_job_id_unique_idx on public.boards(job_id)
      where job_id is not null;
  end if;
end $$;

-- ============================================================================
-- PART 3: Update RLS policies for boards to allow member inserts
-- ============================================================================

-- Members need to be able to create boards during job creation or auto-healing
drop policy if exists "Members can insert boards" on public.boards;
create policy "Members can insert boards"
  on public.boards
  for insert
  with check (public.is_company_member(company_id));

-- ============================================================================
-- PART 4: Update RLS policies for board_groups to allow member inserts
-- ============================================================================

drop policy if exists "Members can insert board groups" on public.board_groups;
create policy "Members can insert board groups"
  on public.board_groups
  for insert
  with check (public.is_company_member(company_id));

-- ============================================================================
-- PART 5: Migrate existing board_groups to link to boards
-- ============================================================================

-- For existing groups that don't have board_id set, try to link them to their board
-- based on company_id match (best effort - there may be ambiguity)
do $$
declare
  group_record record;
  board_record record;
begin
  -- Only process groups without board_id
  for group_record in
    select id, company_id, name
    from public.board_groups
    where board_id is null
  loop
    -- Try to find a matching board for this company
    -- Prefer job-specific "Applicants" boards
    select id into board_record
    from public.boards
    where company_id = group_record.company_id
      and job_id is not null
      and name = 'Applicants'
    order by created_at desc
    limit 1;

    if board_record.id is not null then
      update public.board_groups
      set board_id = board_record.id
      where id = group_record.id;
    end if;
  end loop;
end $$;
