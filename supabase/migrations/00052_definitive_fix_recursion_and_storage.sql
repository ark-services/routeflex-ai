-- =============================================================================
-- Migration 00052: Definitive elimination of company_members RLS recursion
-- =============================================================================
--
-- HISTORY OF ATTEMPTS
-- ────────────────────────────────────────────────────────────────────────────
-- 00050  – DO-block dropped recursive company_members policy; also tried to
--          rewrite get_public_form_by_token.  The function rewrite raised 42P13
--          on some deployments, rolling back the entire file.
--
-- 00051  – Repeated the DO-block + hardened is_company_member.  Rolled back
--          because "company_members_select_own" already existed from a partial
--          prior run.
--
-- 00052 attempt 1  – Hard-dropped a single known resumes policy by name; missed
--          any differently-named policies.  Verification EXCEPTION rolled back.
--
-- 00052 attempt 2  – Dynamic loop scanned only cmd='SELECT'.  The files-bucket
--          INSERT and DELETE policies (migration 00048) both reference
--          company_members and survived.  Verification EXCEPTION:
--            "Company members can delete board files,
--             Company members can upload board files"
--
-- THIS VERSION (attempt 3)
-- ────────────────────────────────────────────────────────────────────────────
-- Drops ALL storage.objects policies (any bucket, any cmd) whose qual or
-- with_check contains "company_members", then recreates clean replacements for:
--   • resumes bucket  (SELECT)
--   • files   bucket  (INSERT / SELECT / DELETE)
--   • logos   bucket  (INSERT / SELECT / UPDATE / DELETE)
-- All replacements call public.is_company_member() — SECURITY DEFINER, owned
-- by postgres — so company_members is never touched from within a policy.
--
-- FILES BUCKET PATH FORMAT  (established in migration 00048 + uploadBoardFile)
--   {companyId}/{boardId}/{columnId}/{timestamp}_{filename}
--   split_part(name, '/', 1) = companyId
--
-- RESUMES BUCKET PATH FORMAT  (established in migration 00006)
--   {companyId}/{jobId}/{filename}
--   split_part(name, '/', 1) = companyId
--
-- LOGOS BUCKET PATH FORMAT  (established in migration 00050 + actions.ts)
--   {companyId}/{formId}/{timestamp}-{filename}
--   split_part(name, '/', 1) = companyId
-- =============================================================================


-- =============================================================================
-- PART 1: Permanently eliminate ALL recursive company_members policies
-- =============================================================================

-- Hard-drop every known name first (idempotent; IF EXISTS never errors).
-- Migration 00001:
DROP POLICY IF EXISTS "Users can view members of their companies" ON public.company_members;
-- Migrations 00050 / 00051:
DROP POLICY IF EXISTS "company_members_select_own" ON public.company_members;
DROP POLICY IF EXISTS "company_members_insert_own" ON public.company_members;
DROP POLICY IF EXISTS "company_members_update_own" ON public.company_members;
DROP POLICY IF EXISTS "company_members_delete_own" ON public.company_members;
-- This migration's own prior runs:
DROP POLICY IF EXISTS "cm_select_own_row" ON public.company_members;
DROP POLICY IF EXISTS "cm_insert_own_row" ON public.company_members;
DROP POLICY IF EXISTS "cm_update_own_row" ON public.company_members;
DROP POLICY IF EXISTS "cm_delete_own_row" ON public.company_members;

-- Sweep for anything else with an unexpected name (dashboard-created, etc.)
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
    RAISE NOTICE '[00052] Dropped company_members policy: %', pol.policyname;
  END LOOP;
END $$;

-- Four simple own-row policies — no subquery, no self-reference, no recursion.
CREATE POLICY "cm_select_own_row"
  ON public.company_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "cm_insert_own_row"
  ON public.company_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cm_update_own_row"
  ON public.company_members FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "cm_delete_own_row"
  ON public.company_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- PART 2: Fix companies SELECT policy
-- =============================================================================

DROP POLICY IF EXISTS "Users can view their companies"            ON public.companies;
DROP POLICY IF EXISTS "Users can view members of their companies" ON public.companies;
DROP POLICY IF EXISTS "companies_select_member"                   ON public.companies;

CREATE POLICY "companies_select_member"
  ON public.companies FOR SELECT
  USING (public.is_company_member(id));


-- =============================================================================
-- PART 3: Harden is_company_member() and is_company_admin()
-- =============================================================================
-- OWNER postgres  →  postgres is a superuser with BYPASSRLS.
--                    SECURITY DEFINER functions run as postgres, so their
--                    internal queries skip ALL RLS — recursion impossible.
-- SET search_path = ''  →  prevents schema-injection attacks.
-- Body references only account_memberships, never company_members.

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies            c
    JOIN public.account_memberships am ON am.account_id = c.account_id
    WHERE c.id = p_company_id
      AND am.user_id = auth.uid()
  );
$$;

ALTER FUNCTION public.is_company_member(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated, anon;


CREATE OR REPLACE FUNCTION public.is_company_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies            c
    JOIN public.account_memberships am ON am.account_id = c.account_id
    WHERE c.id = p_company_id
      AND am.user_id = auth.uid()
      AND am.role IN ('owner', 'admin')
  );
$$;

ALTER FUNCTION public.is_company_admin(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_company_admin(uuid) TO authenticated, anon;


-- =============================================================================
-- PART 4: Sweep ALL storage.objects policies that reference company_members
--         (any bucket, ANY cmd — SELECT / INSERT / UPDATE / DELETE)
-- =============================================================================
-- Previous attempts only swept cmd='SELECT', leaving INSERT and DELETE policies
-- from migration 00048 ("Company members can upload/delete board files") alive.
-- This DO-block has NO cmd filter.

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND (
        qual       ILIKE '%company_members%'
        OR with_check ILIKE '%company_members%'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname
    );
    RAISE NOTICE '[00052] Dropped storage.objects % policy: %', pol.cmd, pol.policyname;
  END LOOP;
END $$;

-- Belt-and-suspenders: hard-drop every name we have ever given these policies,
-- covering the case where pg_policies.qual normalisation differs across versions.

-- files bucket (migration 00048):
DROP POLICY IF EXISTS "Company members can upload board files" ON storage.objects;
DROP POLICY IF EXISTS "Company members can view board files"   ON storage.objects;
DROP POLICY IF EXISTS "Company members can delete board files" ON storage.objects;
-- files bucket (this migration's prior runs):
DROP POLICY IF EXISTS "files_insert_company_member"            ON storage.objects;
DROP POLICY IF EXISTS "files_select_company_member"            ON storage.objects;
DROP POLICY IF EXISTS "files_delete_company_member"            ON storage.objects;

-- resumes bucket (migration 00006):
DROP POLICY IF EXISTS "Members can view company resumes"       ON storage.objects;
-- resumes bucket (this migration's prior runs):
DROP POLICY IF EXISTS "resumes_select_company_member"          ON storage.objects;

-- logos bucket (migrations 00050 / 00051 / prior 00052 runs):
DROP POLICY IF EXISTS "logos_insert_company_member"            ON storage.objects;
DROP POLICY IF EXISTS "logos_select_company_member"            ON storage.objects;
DROP POLICY IF EXISTS "logos_update_company_member"            ON storage.objects;
DROP POLICY IF EXISTS "logos_delete_company_member"            ON storage.objects;


-- =============================================================================
-- PART 5: Recreate clean storage.objects policies — no company_members anywhere
-- =============================================================================
-- All three buckets use the same path convention:
--   first path segment = companyId
--   split_part(name, '/', 1)::uuid   → companyId
-- is_company_member() is SECURITY DEFINER owned by postgres; its body never
-- touches company_members, so calling it from a policy cannot recurse.

-- ── resumes bucket ─────────────────────────────────────────────────────────
-- Original upload policy ("Anyone can upload resumes") is intentionally
-- permissive (no auth check) and does NOT reference company_members — leave it.
-- We only replace the SELECT policy.

CREATE POLICY "resumes_select_company_member"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

-- ── files bucket ───────────────────────────────────────────────────────────
-- Path: {companyId}/{boardId}/{columnId}/{timestamp}_{filename}
-- Note: the upload route uses a service-role client (RLS bypassed for INSERT),
-- but the policies must still be non-recursive for SELECT and for any
-- authenticated clients that call storage directly.

CREATE POLICY "files_insert_company_member"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'files'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "files_select_company_member"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'files'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "files_delete_company_member"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'files'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

-- ── logos bucket ───────────────────────────────────────────────────────────
-- Path: {companyId}/{formId}/{timestamp}-{filename}

CREATE POLICY "logos_insert_company_member"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "logos_select_company_member"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "logos_update_company_member"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "logos_delete_company_member"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );


-- =============================================================================
-- PART 6: Verification — RAISE EXCEPTION (rolls back) if anything is wrong
-- =============================================================================
DO $$
DECLARE
  v_cm_total     integer;
  v_cm_recursive integer;
  v_storage_bad  integer;
  v_bad_names    text;
  v_fn_owner     text;
  v_fn_secdef    boolean;
BEGIN
  -- Count all company_members policies
  SELECT count(*) INTO v_cm_total
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'company_members';

  -- Any that still self-reference (the recursion root)
  SELECT count(*) INTO v_cm_recursive
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'company_members'
    AND (qual ILIKE '%company_members%' OR with_check ILIKE '%company_members%');

  -- Any storage.objects policy (any bucket, any cmd) still referencing company_members
  SELECT count(*), string_agg(policyname, ', ' ORDER BY policyname)
  INTO v_storage_bad, v_bad_names
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename  = 'objects'
    AND (qual ILIKE '%company_members%' OR with_check ILIKE '%company_members%');

  -- is_company_member function attributes
  SELECT pg_get_userbyid(p.proowner), p.prosecdef
  INTO v_fn_owner, v_fn_secdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_company_member';

  RAISE NOTICE '=================================================================';
  RAISE NOTICE '  Migration 00052 — verification summary';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '  company_members total policies       : % (expect 4)', v_cm_total;
  RAISE NOTICE '  company_members recursive quals      : % (expect 0)', v_cm_recursive;
  RAISE NOTICE '  storage.objects bad policies (all)   : % (expect 0)', v_storage_bad;
  RAISE NOTICE '  is_company_member owner              : % (expect postgres)', v_fn_owner;
  RAISE NOTICE '  is_company_member secdefiner         : % (expect true)', v_fn_secdef;
  RAISE NOTICE '=================================================================';

  IF v_cm_recursive > 0 THEN
    RAISE EXCEPTION
      '[00052] % recursive company_members policy/policies remain: check pg_policies',
      v_cm_recursive;
  END IF;

  IF v_storage_bad > 0 THEN
    RAISE EXCEPTION
      '[00052] % storage.objects policy/policies still reference company_members: %',
      v_storage_bad, v_bad_names;
  END IF;

  IF v_fn_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION
      '[00052] is_company_member owner is "%" — must be postgres', v_fn_owner;
  END IF;

  IF NOT v_fn_secdef THEN
    RAISE EXCEPTION '[00052] is_company_member is not SECURITY DEFINER';
  END IF;

  RAISE NOTICE '  ✓ All checks passed — 42P17 recursion fully eliminated.';
END $$;
