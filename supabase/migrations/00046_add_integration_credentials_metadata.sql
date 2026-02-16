-- Migration: Add metadata column to integration_credentials
-- This column stores provider-specific data (e.g., connected email address)
-- Safe to run multiple times (IF NOT EXISTS)

-- Add metadata column if it doesn't exist
alter table public.integration_credentials
  add column if not exists metadata jsonb default '{}';

-- Add comment for documentation
comment on column public.integration_credentials.metadata is
  'Provider-specific metadata (e.g., connected email address for display)';
