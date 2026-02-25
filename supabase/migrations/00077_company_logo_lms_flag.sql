-- Migration: 00077_company_logo_lms_flag
--
-- Adds:
--   companies.logo_url    — public URL of the company's logo (for LMS white-labeling)
--   companies.lms_enabled — feature flag; LMS pages are hidden unless this is true.
--                           Toggled per-company by super-admin (or eventually by billing).

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS logo_url   text,
  ADD COLUMN IF NOT EXISTS lms_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN companies.logo_url IS
  'Public URL of the company logo stored in the company-logos Supabase Storage bucket. '
  'Used on the learner portal for white-labeling.';

COMMENT ON COLUMN companies.lms_enabled IS
  'LMS feature flag. When false the Training nav item and /training/* routes are hidden. '
  'Set to true per-company by super-admin when the company subscribes to an LMS plan.';
