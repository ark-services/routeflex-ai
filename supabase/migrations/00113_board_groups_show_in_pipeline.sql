-- Add show_in_pipeline toggle per board group (defaults to true so all existing groups appear)
ALTER TABLE board_groups
  ADD COLUMN IF NOT EXISTS show_in_pipeline boolean NOT NULL DEFAULT true;
