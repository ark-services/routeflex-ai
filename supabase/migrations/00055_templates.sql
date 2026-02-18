-- =============================================================================
-- Migration 00055: Template Center
-- =============================================================================
-- Adds:
--   • templates table (super-admin managed, jsonb payload)
--   • job_template_applications table (tracks cloning history)
--   • is_super_admin() SECURITY DEFINER helper
--   • templates storage bucket + policies
-- =============================================================================


-- =============================================================================
-- PART 1: is_super_admin() helper
-- =============================================================================
-- Checks auth.users.email directly; never touches company_members → no recursion.
-- Owned by postgres (BYPASSRLS) so it can read auth.users safely.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = auth.uid()
      AND email = 'dan.cristo@go-ark.services'
  );
$$;

ALTER FUNCTION public.is_super_admin() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, anon;


-- =============================================================================
-- PART 2: templates table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.templates (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text        NOT NULL,
  description    text,
  thumbnail_path text,                             -- storage path in 'templates' bucket
  payload        jsonb       NOT NULL DEFAULT '{}',
  created_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_published   boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS templates_is_published_idx ON public.templates(is_published);
CREATE INDEX IF NOT EXISTS templates_created_at_idx   ON public.templates(created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS templates_set_updated_at ON public.templates;
CREATE TRIGGER templates_set_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can view published templates; super admin can view all
CREATE POLICY "templates_select"
  ON public.templates FOR SELECT
  TO authenticated
  USING (is_published = true OR public.is_super_admin());

-- Only super admin can insert/update/delete
CREATE POLICY "templates_insert_super_admin"
  ON public.templates FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "templates_update_super_admin"
  ON public.templates FOR UPDATE
  TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "templates_delete_super_admin"
  ON public.templates FOR DELETE
  TO authenticated
  USING (public.is_super_admin());


-- =============================================================================
-- PART 3: job_template_applications table
-- =============================================================================
-- Records each time a template is applied to a job.
-- No hard unique constraint — we allow re-application with explicit confirmation.
-- The server action checks for prior applications and warns the user.

CREATE TABLE IF NOT EXISTS public.job_template_applications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  template_id uuid        NOT NULL REFERENCES public.templates(id) ON DELETE RESTRICT,
  applied_by  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jta_job_id_idx      ON public.job_template_applications(job_id);
CREATE INDEX IF NOT EXISTS jta_template_id_idx ON public.job_template_applications(template_id);
CREATE INDEX IF NOT EXISTS jta_applied_at_idx  ON public.job_template_applications(applied_at DESC);

-- RLS
ALTER TABLE public.job_template_applications ENABLE ROW LEVEL SECURITY;

-- Members can view applications for jobs in their companies
CREATE POLICY "jta_select_company_member"
  ON public.job_template_applications FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT j.id
      FROM   public.jobs j
      JOIN   public.companies c ON c.id = j.company_id
      JOIN   public.account_memberships am ON am.account_id = c.account_id
      WHERE  am.user_id = auth.uid()
    )
  );

-- Members can apply templates to their company's jobs
CREATE POLICY "jta_insert_company_member"
  ON public.job_template_applications FOR INSERT
  TO authenticated
  WITH CHECK (
    job_id IN (
      SELECT j.id
      FROM   public.jobs j
      JOIN   public.companies c ON c.id = j.company_id
      JOIN   public.account_memberships am ON am.account_id = c.account_id
      WHERE  am.user_id = auth.uid()
    )
  );


-- =============================================================================
-- PART 4: templates storage bucket + policies
-- =============================================================================
-- Path convention: thumbnails/{templateId}/{timestamp}-{filename}
-- SELECT: any authenticated user
-- INSERT/UPDATE/DELETE: only super admin

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'templates',
  'templates',
  false,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Drop any prior runs of these policies (idempotent)
DROP POLICY IF EXISTS "templates_storage_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "templates_storage_insert_super_admin"   ON storage.objects;
DROP POLICY IF EXISTS "templates_storage_update_super_admin"   ON storage.objects;
DROP POLICY IF EXISTS "templates_storage_delete_super_admin"   ON storage.objects;

CREATE POLICY "templates_storage_select_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'templates');

CREATE POLICY "templates_storage_insert_super_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'templates'
    AND public.is_super_admin()
  );

CREATE POLICY "templates_storage_update_super_admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'templates'
    AND public.is_super_admin()
  );

CREATE POLICY "templates_storage_delete_super_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'templates'
    AND public.is_super_admin()
  );


-- =============================================================================
-- PART 5: Verification
-- =============================================================================
DO $$
DECLARE
  v_fn_owner  text;
  v_fn_secdef boolean;
BEGIN
  SELECT pg_get_userbyid(p.proowner), p.prosecdef
  INTO v_fn_owner, v_fn_secdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_super_admin';

  RAISE NOTICE '=================================================================';
  RAISE NOTICE '  Migration 00055 — verification';
  RAISE NOTICE '  is_super_admin owner     : % (expect postgres)', v_fn_owner;
  RAISE NOTICE '  is_super_admin secdefiner: % (expect true)',     v_fn_secdef;
  RAISE NOTICE '=================================================================';

  IF v_fn_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION '[00055] is_super_admin owner is "%" — must be postgres', v_fn_owner;
  END IF;

  IF NOT v_fn_secdef THEN
    RAISE EXCEPTION '[00055] is_super_admin is not SECURITY DEFINER';
  END IF;

  RAISE NOTICE '  ✓ Migration 00055 passed all checks.';
END $$;
