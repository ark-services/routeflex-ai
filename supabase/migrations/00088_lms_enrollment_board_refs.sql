-- Migration: 00088_lms_enrollment_board_refs
--
-- Adds board column + status label references to lms_enrollments so the
-- quiz submit API can write progress back to the applicant's board row
-- in real time without knowing the automation configuration.
--
-- All columns are nullable — enrollments created without board refs (e.g.
-- manually via Enroll Applicant) simply skip the board-write step.

ALTER TABLE public.lms_enrollments
  -- Text column to write progress messages into (e.g. "In Progress · 3/9 modules")
  ADD COLUMN IF NOT EXISTS output_column_id   uuid REFERENCES public.board_columns(id) ON DELETE SET NULL,

  -- Status column to drive pipeline automations (board.status_changes_to trigger)
  ADD COLUMN IF NOT EXISTS status_column_id   uuid REFERENCES public.board_columns(id) ON DELETE SET NULL,

  -- Label IDs to set on the status column at each lifecycle stage
  ADD COLUMN IF NOT EXISTS link_sent_label_id     uuid REFERENCES public.board_status_labels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS in_progress_label_id   uuid REFERENCES public.board_status_labels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS passed_label_id        uuid REFERENCES public.board_status_labels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS failed_label_id        uuid REFERENCES public.board_status_labels(id) ON DELETE SET NULL;

DO $$
BEGIN
  RAISE NOTICE '✅ Added board refs to lms_enrollments';
  RAISE NOTICE '   output_column_id  — text progress messages';
  RAISE NOTICE '   status_column_id  — status column for pipeline triggers';
  RAISE NOTICE '   link_sent / in_progress / passed / failed label IDs';
END $$;
