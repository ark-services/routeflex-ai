-- Add token expiry and revocation columns to lms_enrollments and applicants.
-- Existing rows get NULL = no expiry (backward compatible).

ALTER TABLE public.lms_enrollments
  ADD COLUMN IF NOT EXISTS token_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS token_revoked_at  timestamptz;

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS token_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS token_revoked_at  timestamptz;
