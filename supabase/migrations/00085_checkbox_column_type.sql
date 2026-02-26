-- ============================================================================
-- Add 'checkbox' board column type
--
-- Context: Form Builder has a 'checkbox' question type (boolean yes/no) and
-- a 'select' / 'radio' type (single choice from a list of options).  The board
-- previously mapped all three to plain 'text' columns, losing their semantics.
--
-- This migration:
-- 1. Adds value_bool to board_cells so checkbox columns can persist a boolean.
-- 2. Extends board_columns.type to allow 'checkbox'.
-- (select/radio → status is a code-only change; no new DB type needed.)
-- ============================================================================

-- ============================================================================
-- PART 1: Add value_bool column to board_cells
-- ============================================================================

ALTER TABLE public.board_cells
  ADD COLUMN IF NOT EXISTS value_bool boolean;

-- ============================================================================
-- PART 2: Update board_columns type constraint to include 'checkbox'
-- ============================================================================

ALTER TABLE public.board_columns
  DROP CONSTRAINT IF EXISTS board_columns_type_check;

ALTER TABLE public.board_columns
  ADD CONSTRAINT board_columns_type_check
  CHECK (type IN (
    'text', 'number', 'date', 'file', 'status', 'email', 'phone', 'location',
    'checkbox',
    'fadv.package', 'fadv.location', 'fadv.facility_id', 'fadv.position_type'
  ));

-- ============================================================================
-- SUCCESS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Added value_bool column to board_cells';
  RAISE NOTICE '✅ Extended board_columns type constraint to include checkbox';
  RAISE NOTICE '   ';
  RAISE NOTICE 'Supported column types: text, number, date, file, status, email, phone, location, checkbox, fadv.*';
END $$;
