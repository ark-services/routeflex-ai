-- ============================================================================
-- Add missing value columns to board_cells table
--
-- Context: board_cells currently only has id, applicant_id, column_id,
-- created_at, updated_at. App code expects value storage columns for
-- different data types used in Monday.com-style board columns.
-- ============================================================================

-- Add value columns for different data types
ALTER TABLE public.board_cells
  ADD COLUMN IF NOT EXISTS value_text text,
  ADD COLUMN IF NOT EXISTS value_number numeric,
  ADD COLUMN IF NOT EXISTS value_date date,
  ADD COLUMN IF NOT EXISTS value_status_label_id uuid REFERENCES public.board_status_labels(id) ON DELETE SET NULL;

-- Add helpful indexes for query performance
CREATE INDEX IF NOT EXISTS board_cells_applicant_id_idx
  ON public.board_cells(applicant_id);

CREATE INDEX IF NOT EXISTS board_cells_column_id_idx
  ON public.board_cells(column_id);

-- Optional: Index on status label FK for faster joins
CREATE INDEX IF NOT EXISTS board_cells_value_status_label_id_idx
  ON public.board_cells(value_status_label_id)
  WHERE value_status_label_id IS NOT NULL;

-- ============================================================================
-- SUCCESS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Added value columns to board_cells table';
  RAISE NOTICE '   - value_text (text)';
  RAISE NOTICE '   - value_number (numeric)';
  RAISE NOTICE '   - value_date (date)';
  RAISE NOTICE '   - value_status_label_id (uuid, FK to board_status_labels)';
  RAISE NOTICE '   ';
  RAISE NOTICE '✅ Added indexes:';
  RAISE NOTICE '   - board_cells_applicant_id_idx';
  RAISE NOTICE '   - board_cells_column_id_idx';
  RAISE NOTICE '   - board_cells_value_status_label_id_idx (partial, where not null)';
END $$;
