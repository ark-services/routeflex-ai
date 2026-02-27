-- Add is_sample flag to applicants so the board can visually distinguish
-- the seeded example row from real applicants without relying on fragile
-- email/name string matching.

ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

-- Back-fill any existing example rows that were seeded by the job-creation
-- wizard (they have the exact sentinel values used in actions.ts).
UPDATE applicants
SET is_sample = true
WHERE email = 'example@applicant.test'
  AND full_name = 'Example Applicant'
  AND is_sample = false;
