-- Migration 00100: Add trigger_config column to automations table
--
-- This column stores trigger-specific configuration as JSONB.
-- Currently used by the 'gmail.email_received' trigger to store
-- Gmail matching rules (sender_contains, subject_contains, etc.).
--
-- Was added manually to local/staging but never via a migration,
-- so prod is missing it and poll-inbox cron is failing with code 42703.

ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS trigger_config jsonb NOT NULL DEFAULT '{}';
