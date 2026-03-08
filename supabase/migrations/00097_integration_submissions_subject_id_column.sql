-- Add subject_id_column_id to integration_submissions so that the
-- FADV "Add Subject" automation can write the returned Applicant ID
-- to a dedicated board column separate from the status output column.

ALTER TABLE integration_submissions
  ADD COLUMN IF NOT EXISTS subject_id_column_id uuid
    REFERENCES board_columns(id) ON DELETE SET NULL;
