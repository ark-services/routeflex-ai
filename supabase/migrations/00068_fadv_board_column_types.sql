-- =============================================================================
-- Migration 00068: FADV integration-backed board column types
-- =============================================================================
--
-- Adds fadv.package, fadv.location, fadv.facility_id, fadv.position_type
-- to the board_columns type CHECK constraint.
-- These columns store their values in board_cells.value_text AND sync to
-- applicant_integration_fields.fields for FADV submission.
-- =============================================================================


-- ── Update board_columns type constraint ──────────────────────────────────────

-- Drop existing constraint
ALTER TABLE public.board_columns
  DROP CONSTRAINT IF EXISTS board_columns_type_check;

-- Add updated constraint with FADV column types
ALTER TABLE public.board_columns
  ADD CONSTRAINT board_columns_type_check
  CHECK (type IN (
    'text', 'number', 'date', 'file', 'status', 'email', 'phone', 'location',
    'fadv.package', 'fadv.location', 'fadv.facility_id', 'fadv.position_type'
  ));


-- ── SUCCESS ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '✅ Updated board_columns type constraint';
  RAISE NOTICE '   Added: fadv.package, fadv.location, fadv.facility_id, fadv.position_type';
  RAISE NOTICE '   All 12 column types: text, number, date, file, status, email, phone, location,';
  RAISE NOTICE '                        fadv.package, fadv.location, fadv.facility_id, fadv.position_type';
END $$;
