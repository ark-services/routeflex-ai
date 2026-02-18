-- =============================================================================
-- Migration 00056: Soft-delete for templates
-- =============================================================================
-- Instead of hard-deleting template rows (which violates the FK constraint on
-- job_template_applications.template_id), we mark them with deleted_at.
-- deleted_at IS NOT NULL  →  template is soft-deleted (invisible to users)
-- deleted_at IS NULL      →  template is live
--
-- No existing rows or FK relationships are altered.
-- =============================================================================

-- 1. Add the column (idempotent)
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 2. Partial index — makes "WHERE deleted_at IS NULL" scans fast
CREATE INDEX IF NOT EXISTS templates_deleted_at_null_idx
  ON public.templates (created_at DESC)
  WHERE deleted_at IS NULL;

-- 3. Update the SELECT RLS policy to hide soft-deleted rows.
--    Previous policy: published=true OR super_admin
--    New policy     : not deleted AND (published=true OR super_admin)
DROP POLICY IF EXISTS "templates_select" ON public.templates;

CREATE POLICY "templates_select"
  ON public.templates FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (is_published = true OR public.is_super_admin())
  );

-- 4. The UPDATE policy already allows super admin to update any row, so
--    setting deleted_at via UPDATE is permitted without further changes.
--    The DELETE policy is intentionally left in place for emergency use.

DO $$
BEGIN
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '  Migration 00056 — template soft-delete';
  RAISE NOTICE '  • deleted_at column added to templates';
  RAISE NOTICE '  • templates_deleted_at_null_idx index created';
  RAISE NOTICE '  • templates_select RLS policy updated (excludes deleted rows)';
  RAISE NOTICE '  ✓ Migration 00056 complete.';
  RAISE NOTICE '=================================================================';
END $$;
