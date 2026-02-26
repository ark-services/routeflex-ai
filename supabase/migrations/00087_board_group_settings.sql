-- Add per-group settings JSONB to board_groups.
-- Used to store per-group column collapse state:
--   settings.collapsed_columns: string[]  (array of board_column IDs collapsed in this group)
ALTER TABLE public.board_groups
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb NOT NULL;
