-- One-time cleanup script to consolidate duplicate boards
-- Run this AFTER applying migration 00008_fix_boards_schema.sql

-- 1) For each company with multiple boards, pick the oldest "Applicants" board as canonical
-- 2) Update board_columns to point to the canonical board
-- 3) Delete duplicate boards

do $$
declare
  company_record record;
  canonical_board_id uuid;
  duplicate_board_ids uuid[];
begin
  -- For each company that has boards
  for company_record in
    select company_id, count(*) as board_count
    from public.boards
    where name ilike '%Applicants%'
    group by company_id
    having count(*) > 1
  loop
    raise notice 'Company % has % Applicants boards', company_record.company_id, company_record.board_count;

    -- Get the canonical (oldest) board for this company
    select id into canonical_board_id
    from public.boards
    where company_id = company_record.company_id
      and name ilike '%Applicants%'
    order by created_at asc
    limit 1;

    raise notice 'Canonical board: %', canonical_board_id;

    -- Get all duplicate boards for this company
    select array_agg(id) into duplicate_board_ids
    from public.boards
    where company_id = company_record.company_id
      and name ilike '%Applicants%'
      and id != canonical_board_id;

    raise notice 'Duplicate boards: %', duplicate_board_ids;

    -- Update all board_columns that reference duplicate boards to use canonical board
    if duplicate_board_ids is not null then
      update public.board_columns
      set board_id = canonical_board_id
      where board_id = any(duplicate_board_ids);

      raise notice 'Updated board_columns to use canonical board';

      -- Delete duplicate boards
      delete from public.boards
      where id = any(duplicate_board_ids);

      raise notice 'Deleted % duplicate boards', array_length(duplicate_board_ids, 1);
    end if;

    -- Rename canonical board to "Applicants" if it has a different name
    update public.boards
    set name = 'Applicants'
    where id = canonical_board_id
      and name != 'Applicants';

    raise notice 'Standardized board name to "Applicants"';
  end loop;

  -- Handle companies with boards but no board_columns.board_id set
  update public.board_columns bc
  set board_id = b.id
  from public.boards b
  where bc.company_id = b.company_id
    and b.name = 'Applicants'
    and bc.board_id is null;

  raise notice 'Updated board_columns with null board_id';

end $$;

-- Verify results
select
  c.id as company_id,
  c.name as company_name,
  count(distinct b.id) as board_count,
  count(distinct bc.id) as column_count
from public.companies c
left join public.boards b on b.company_id = c.id
left join public.board_columns bc on bc.company_id = c.id
group by c.id, c.name
order by c.name;
