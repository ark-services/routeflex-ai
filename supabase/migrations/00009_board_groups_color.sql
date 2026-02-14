-- Migration: Add color column to board_groups for Monday-style group colors

-- Add color column with default colors
alter table public.board_groups
  add column if not exists color text not null default '#0073ea';

-- Add is_collapsed column for group expand/collapse state
alter table public.board_groups
  add column if not exists is_collapsed boolean not null default false;

-- Set diverse default colors for existing groups (cycle through Monday-style colors)
do $$
declare
  group_record record;
  colors text[] := array['#0073ea', '#00c875', '#fdab3d', '#e2445c', '#9cd326', '#784bd1', '#579bfc', '#ff642e'];
  color_idx int := 0;
begin
  for group_record in
    select id from public.board_groups order by created_at
  loop
    update public.board_groups
    set color = colors[(color_idx % array_length(colors, 1)) + 1]
    where id = group_record.id;

    color_idx := color_idx + 1;
  end loop;
end $$;
