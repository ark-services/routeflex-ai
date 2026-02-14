-- Migration: Link board_groups to boards, dedupe job-scoped boards, and enforce boards(job_id) uniqueness
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
-- PART 2: Dedupe boards per job_id (required before enforcing uniqueness)
-- ============================================================================

-- If multiple boards exist for the same job_id, the unique index creation will fail.
-- Keep ONE canonical board per job_id and re-point related rows to it.
-- Canonical preference order:
--   1) name = 'Applicants'
--   2) earliest created_at

do $$
declare
  r record;
  canonical_id uuid;
  dup_id uuid;
begin
  -- Iterate over job_ids that have duplicates
  for r in
    select job_id
    from public.boards
    where job_id is not null
    group by job_id
    having count(*) > 1
  loop
    -- Pick canonical board
    select b.id into canonical_id
    from public.boards b
    where b.job_id = r.job_id
    order by (case when b.name = 'Applicants' then 0 else 1 end), b.created_at asc
    limit 1;

    -- Re-point board_groups (if board_id exists)
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'board_groups'
        and column_name = 'board_id'
    ) then
      update public.board_groups bg
      set board_id = canonical_id
      where bg.board_id in (
        select id from public.boards where job_id = r.job_id and id <> canonical_id
      );
    end if;

    -- Re-point board_columns (if present)
    -- IMPORTANT: board_columns has a unique constraint on (board_id, name). When merging duplicate boards,
    -- we must merge columns with the same name instead of blindly updating board_id.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'board_columns'
        and column_name = 'board_id'
    ) then
      declare
        dup_col record;
        canonical_col_id uuid;
        has_board_cells boolean;
        has_bsl_column_id boolean;
      begin
        -- Detect dependent tables/columns safely
        select exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'board_cells'
            and column_name = 'column_id'
        ) into has_board_cells;

        select exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'board_status_labels'
            and column_name = 'column_id'
        ) into has_bsl_column_id;

        -- Iterate over columns on duplicate boards for this job
        for dup_col in
          select id, name
          from public.board_columns
          where board_id in (
            select id from public.boards where job_id = r.job_id and id <> canonical_id
          )
        loop
          -- If canonical board already has a column with the same name, merge into it
          select id into canonical_col_id
          from public.board_columns
          where board_id = canonical_id
            and name = dup_col.name
          limit 1;

          if canonical_col_id is not null then
            -- Re-point board_cells to canonical column id
            if has_board_cells then
              update public.board_cells
              set column_id = canonical_col_id
              where column_id = dup_col.id;
            end if;

            -- Re-point board_status_labels to canonical column id
            if has_bsl_column_id then
              update public.board_status_labels
              set column_id = canonical_col_id
              where column_id = dup_col.id;
            end if;

            -- Delete the duplicate column now that dependents are moved
            delete from public.board_columns where id = dup_col.id;
          else
            -- No collision: move the column to the canonical board
            update public.board_columns
            set board_id = canonical_id
            where id = dup_col.id;
          end if;
        end loop;
      end;
    end if;

    -- Re-point board_status_labels (if present)
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'board_status_labels'
        and column_name = 'board_id'
    ) then
      update public.board_status_labels bsl
      set board_id = canonical_id
      where bsl.board_id in (
        select id from public.boards where job_id = r.job_id and id <> canonical_id
      );
    end if;

    -- Re-point any applicants.board_id (if present)
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'applicants'
        and column_name = 'board_id'
    ) then
      update public.applicants a
      set board_id = canonical_id
      where a.board_id in (
        select id from public.boards where job_id = r.job_id and id <> canonical_id
      );
    end if;

    -- Delete duplicate boards (non-canonical)
    for dup_id in
      select id
      from public.boards
      where job_id = r.job_id
        and id <> canonical_id
    loop
      delete from public.boards where id = dup_id;
    end loop;
  end loop;
end $$;

-- ============================================================================
-- PART 3: Ensure unique constraint on boards(job_id) exists
-- ============================================================================

-- Keep the partial unique index for data integrity
-- (Code doesn't rely on ON CONFLICT anymore - uses insert-retry pattern)
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
-- PART 4: Update RLS policies for boards to allow member inserts
-- ============================================================================

-- Members need to be able to create boards during job creation or auto-healing
drop policy if exists "Members can insert boards" on public.boards;
create policy "Members can insert boards"
  on public.boards
  for insert
  with check (public.is_company_member(company_id));

-- ============================================================================
-- PART 5: Update RLS policies for board_groups to allow member inserts
-- ============================================================================

drop policy if exists "Members can insert board groups" on public.board_groups;
create policy "Members can insert board groups"
  on public.board_groups
  for insert
  with check (public.is_company_member(company_id));

-- ============================================================================
-- PART 6: Migrate existing board_groups to link to boards
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
    select id, name into board_record
    from public.boards
    where company_id = group_record.company_id
      and job_id is not null
    order by (case when name = 'Applicants' then 0 else 1 end), created_at desc
    limit 1;

    if board_record.id is not null then
      update public.board_groups
      set board_id = board_record.id
      where id = group_record.id;
    end if;
  end loop;
end $$;
