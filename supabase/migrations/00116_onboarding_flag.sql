-- Add onboarding_completed flag to accounts table
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Backfill: all existing accounts are considered onboarded
UPDATE public.accounts SET onboarding_completed = true WHERE onboarding_completed = false;
