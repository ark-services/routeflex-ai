-- Migration: Add is_hidden column to board_columns
-- This enables true column hiding (not just width collapse)

-- Add is_hidden column (defaults to false for existing columns)
alter table public.board_columns
  add column if not exists is_hidden boolean not null default false;

-- Create index for faster queries on visible columns
create index if not exists board_columns_is_hidden_idx
  on public.board_columns(company_id, is_hidden);
