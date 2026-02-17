-- ============================================================================
-- Add Phone, Location, and File column types to board
--
-- Context: Adds support for phone, location, and file columns to the board.
-- Email was already added in migration 00044. This migration completes the
-- set of new column types needed for advanced board functionality.
-- ============================================================================

-- ============================================================================
-- PART 1: Add value_file_path column to board_cells
-- ============================================================================

ALTER TABLE public.board_cells
  ADD COLUMN IF NOT EXISTS value_file_path text;

-- Add index for file path lookups
CREATE INDEX IF NOT EXISTS board_cells_value_file_path_idx
  ON public.board_cells(value_file_path)
  WHERE value_file_path IS NOT NULL;

-- ============================================================================
-- PART 2: Update board_columns type constraint
-- Add 'phone' and 'location' types (email and file already exist from 00044)
-- ============================================================================

-- Drop existing constraint
ALTER TABLE public.board_columns
  DROP CONSTRAINT IF EXISTS board_columns_type_check;

-- Add constraint with all column types
ALTER TABLE public.board_columns
  ADD CONSTRAINT board_columns_type_check
  CHECK (type IN ('text', 'number', 'date', 'file', 'status', 'email', 'phone', 'location'));

-- ============================================================================
-- PART 3: Create 'files' storage bucket for board file uploads
-- Separate from 'resumes' bucket for better organization
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('files', 'files', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 4: Storage policies for 'files' bucket
-- Company members can upload, view, and delete files for their boards
-- ============================================================================

-- Allow company members to upload files to their company's boards
DROP POLICY IF EXISTS "Company members can upload board files" ON storage.objects;
CREATE POLICY "Company members can upload board files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'files'
    AND (SPLIT_PART(name, '/', 1))::uuid IN (
      SELECT company_id
      FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );

-- Allow company members to view files from their company's boards
DROP POLICY IF EXISTS "Company members can view board files" ON storage.objects;
CREATE POLICY "Company members can view board files"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'files'
    AND (SPLIT_PART(name, '/', 1))::uuid IN (
      SELECT company_id
      FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );

-- Allow company members to delete files from their company's boards
DROP POLICY IF EXISTS "Company members can delete board files" ON storage.objects;
CREATE POLICY "Company members can delete board files"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'files'
    AND (SPLIT_PART(name, '/', 1))::uuid IN (
      SELECT company_id
      FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- SUCCESS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Added value_file_path column to board_cells';
  RAISE NOTICE '✅ Updated board_columns to support phone and location types';
  RAISE NOTICE '✅ Created files storage bucket with RLS policies';
  RAISE NOTICE '   ';
  RAISE NOTICE 'Supported column types: text, number, date, file, status, email, phone, location';
END $$;
