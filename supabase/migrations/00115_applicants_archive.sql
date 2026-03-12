-- Add archive support to applicants
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archived_by uuid DEFAULT NULL REFERENCES auth.users(id);

-- Partial index for fast active-applicant queries (the common case)
CREATE INDEX IF NOT EXISTS idx_applicants_active
  ON public.applicants (company_id, job_id, position)
  WHERE archived_at IS NULL;

-- Index for fetching archived applicants
CREATE INDEX IF NOT EXISTS idx_applicants_archived
  ON public.applicants (company_id, job_id, archived_at DESC)
  WHERE archived_at IS NOT NULL;
