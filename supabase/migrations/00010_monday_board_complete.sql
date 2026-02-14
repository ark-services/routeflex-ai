-- Migration: Complete Monday-style board schema
-- Adds all required columns for full Monday.com functionality

-- 1) Add color and is_collapsed to board_groups (if not exists)
do $$
begin
  if not exists (
    select from information_schema.columns
    where table_schema = 'public'
      and table_name = 'board_groups'
      and column_name = 'color'
  ) then
    alter table public.board_groups add column color text not null default '#22c55e';
  end if;

  if not exists (
    select from information_schema.columns
    where table_schema = 'public'
      and table_name = 'board_groups'
      and column_name = 'is_collapsed'
  ) then
    alter table public.board_groups add column is_collapsed boolean not null default false;
  end if;
end $$;

-- 2) Add position column to applicants for row ordering
do $$
begin
  if not exists (
    select from information_schema.columns
    where table_schema = 'public'
      and table_name = 'applicants'
      and column_name = 'position'
  ) then
    alter table public.applicants add column position int not null default 0;
  end if;
end $$;

-- Create index for position ordering
create index if not exists applicants_group_position_idx on public.applicants(group_id, position);

-- Set initial positions for existing applicants (within each group)
do $$
declare
  group_record record;
  applicant_record record;
  pos int;
begin
  for group_record in
    select distinct group_id from public.applicants where group_id is not null
  loop
    pos := 0;
    for applicant_record in
      select id from public.applicants
      where group_id = group_record.group_id
      order by created_at
    loop
      update public.applicants
      set position = pos
      where id = applicant_record.id;
      pos := pos + 1;
    end loop;
  end loop;

  -- Handle applicants without a group
  pos := 0;
  for applicant_record in
    select id from public.applicants
    where group_id is null
    order by created_at
  loop
    update public.applicants
    set position = pos
    where id = applicant_record.id;
    pos := pos + 1;
  end loop;
end $$;

-- 3) Set diverse colors for existing groups if they're all the same
do $$
declare
  group_record record;
  colors text[] := array['#0073ea', '#00c875', '#fdab3d', '#e2445c', '#9cd326', '#784bd1', '#579bfc', '#ff642e'];
  color_idx int := 0;
begin
  for group_record in
    select id from public.board_groups where color = '#22c55e' order by created_at
  loop
    update public.board_groups
    set color = colors[(color_idx % array_length(colors, 1)) + 1]
    where id = group_record.id;

    color_idx := color_idx + 1;
  end loop;
end $$;
