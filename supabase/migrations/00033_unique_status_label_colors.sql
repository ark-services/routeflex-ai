-- ============================================================================
-- Enforce unique status label colors per column
-- Prevents duplicate colors within the same status column (Monday.com behavior)
-- ============================================================================

-- Add unique constraint for (column_id, color) combination
-- This ensures each color can only be used once per status column
-- Note: Allows the same color across different columns/boards
alter table public.board_status_labels
  add constraint board_status_labels_column_color_unique
  unique (column_id, color);

-- Add index to improve lookup performance when checking available colors
create index if not exists board_status_labels_color_lookup_idx
  on public.board_status_labels(column_id, color);

comment on constraint board_status_labels_column_color_unique on public.board_status_labels is
  'Ensures each color is unique within a status column (Monday.com-style behavior). Allows up to 25 labels per column with distinct colors.';

-- Migration note: If duplicates exist, this migration will fail.
-- In that case, run this query first to identify and fix duplicates:
--
-- SELECT column_id, color, COUNT(*) as count
-- FROM public.board_status_labels
-- GROUP BY column_id, color
-- HAVING COUNT(*) > 1;
--
-- Then either:
-- 1. Manually update duplicate colors to unused colors from the palette
-- 2. Or run a migration script to auto-assign available colors
