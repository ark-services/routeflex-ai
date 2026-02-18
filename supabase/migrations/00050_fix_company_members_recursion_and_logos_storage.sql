-- =============================================================================
-- Migration 00050: Fix company_members RLS infinite recursion + logos bucket
-- =============================================================================
--
-- ROOT CAUSE OF ERROR 42P17
-- ─────────────────────────
-- Migration 00001 created a SELECT policy on public.company_members that
-- references company_members *from within itself*:
--
--   CREATE POLICY "Users can view members of their companies"
--     ON public.company_members FOR SELECT
--     USING (company_id IN (
--       SELECT company_id FROM public.company_members   ← self-reference
--       WHERE user_id = auth.uid()
--     ));
--
-- Whenever *any* RLS policy on another table queries company_members,
-- Postgres tries to enforce the company_members SELECT policy, which
-- queries company_members again — causing infinite recursion.
--
-- FIX STRATEGY
-- ────────────
-- 1. Replace the recursive company_members SELECT policy with a trivial
--    "user can see their own rows" check (no sub-select, no self-reference).
--
-- 2. Replace the companies SELECT policy (migration 00001), which also
--    queries company_members, with a call to is_company_member(id).
--    is_company_member() is SECURITY DEFINER so it bypasses RLS when it
--    internally queries companies + account_memberships — no recursion.
--
-- 3. Add four storage.objects policies for the new "logos" private bucket,
--    all using is_company_member() — which only touches account_memberships,
--    never company_members.
--
-- 4. Extend get_public_form_by_token() to return form settings (needed so
--    the public form page can read the logo path and generate a signed URL).
--
-- POLICIES NOT TOUCHED
-- ────────────────────
-- • "files" bucket   — existing board-file policies are unaffected.
-- • "resumes" bucket — existing resume policies are unaffected.
-- • account_memberships, boards, applicants, jobs, form-engine tables —
--   already use is_company_member() (migrations 00017–00042). No change.
-- =============================================================================


-- =============================================================================
-- PART 1: Fix company_members — drop the recursive SELECT policy
-- =============================================================================
-- We drop every policy on company_members and replace with a single, safe rule:
-- each user may only see their own membership row (no sub-select needed).
-- The broader "who belongs to my company" question is answered by
-- is_company_member(), which uses account_memberships (no recursion).

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_members'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.company_members', pol.policyname
    );
  END LOOP;
END $$;

-- Simple, non-recursive policy: a user can only read their own row.
CREATE POLICY "company_members_select_own"
  ON public.company_members
  FOR SELECT
  USING (user_id = auth.uid());


-- =============================================================================
-- PART 2: Fix companies SELECT policy
-- =============================================================================
-- Migration 00001's policy also queries company_members:
--   id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
-- Switch to is_company_member(id) which is SECURITY DEFINER and therefore
-- bypasses RLS on the tables it internally queries (no recursion possible).

DROP POLICY IF EXISTS "Users can view their companies" ON public.companies;

CREATE POLICY "Users can view their companies"
  ON public.companies
  FOR SELECT
  USING (public.is_company_member(id));


-- =============================================================================
-- PART 3: Storage policies for the "logos" private bucket
-- =============================================================================
-- Object path layout (set by the app):
--   {company_id}/{form_id}/{timestamp}-{filename}
-- Example:
--   fb81bd40-40ba-4a62-a960-ca2f2325763d/3c9f.../1714000000000-logo.png
--
-- storage.foldername(name) returns an array of the folder segments, so
-- (storage.foldername(name))[1] is the first segment = company_id.
--
-- We use is_company_member(company_id) which is SECURITY DEFINER and queries
-- only account_memberships — zero risk of triggering any company_members policy.

-- Drop any pre-existing logos policies to make the migration idempotent.
DROP POLICY IF EXISTS "logos_insert_company_member" ON storage.objects;
DROP POLICY IF EXISTS "logos_select_company_member" ON storage.objects;
DROP POLICY IF EXISTS "logos_update_company_member" ON storage.objects;
DROP POLICY IF EXISTS "logos_delete_company_member" ON storage.objects;

-- INSERT: authenticated member may upload into their company's folder.
CREATE POLICY "logos_insert_company_member"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND public.is_company_member(
      (storage.foldername(name))[1]::uuid
    )
  );

-- SELECT: authenticated member may read logos in their company's folder.
-- Required for createSignedUrl() to succeed on the client / server action.
CREATE POLICY "logos_select_company_member"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND public.is_company_member(
      (storage.foldername(name))[1]::uuid
    )
  );

-- UPDATE: member may overwrite an existing logo object.
CREATE POLICY "logos_update_company_member"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND public.is_company_member(
      (storage.foldername(name))[1]::uuid
    )
  );

-- DELETE: member may remove a logo object.
CREATE POLICY "logos_delete_company_member"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND public.is_company_member(
      (storage.foldername(name))[1]::uuid
    )
  );


-- =============================================================================
-- PART 4: Extend get_public_form_by_token to return form settings
-- =============================================================================
-- The public form page needs settings.design.logoPath to render the logo.
-- We add a `settings` column to the return type.  The function is SECURITY
-- DEFINER so it reads the settings without hitting any user-facing RLS.
--
-- Postgres does NOT allow CREATE OR REPLACE FUNCTION to change the RETURNS TABLE
-- signature (column count, names, types, or order) — error 42P13.
-- We must DROP the old function first, then recreate with the new shape.

DROP FUNCTION IF EXISTS public.get_public_form_by_token(uuid);

CREATE FUNCTION public.get_public_form_by_token(token uuid)
RETURNS TABLE (
  form_id     uuid,
  job_id      uuid,
  company_id  uuid,
  title       text,
  description text,
  settings    jsonb,
  job_title   text,
  company_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id          AS form_id,
    f.job_id,
    f.company_id,
    f.title,
    f.description,
    f.settings,
    j.title       AS job_title,
    c.name        AS company_name
  FROM public.job_application_forms f
  INNER JOIN public.jobs j ON j.id = f.job_id
  INNER JOIN public.companies c ON c.id = f.company_id
  WHERE f.public_token = token
    AND j.status = 'open';
END;
$$;

-- Re-grant execute (CREATE OR REPLACE resets grants in some Postgres versions)
GRANT EXECUTE ON FUNCTION public.get_public_form_by_token(uuid) TO authenticated, anon;


-- =============================================================================
-- Verification notice
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 00050 complete';
  RAISE NOTICE '   1. company_members recursive SELECT policy replaced with user_id = auth.uid()';
  RAISE NOTICE '   2. companies SELECT policy switched to is_company_member(id)';
  RAISE NOTICE '   3. logos bucket: INSERT / SELECT / UPDATE / DELETE policies added';
  RAISE NOTICE '   4. get_public_form_by_token now returns settings (logoPath for public form)';
  RAISE NOTICE '   NOTE: files and resumes bucket policies are untouched.';
END $$;
