-- =============================================================================
-- Migration 00051: Harden company_members RLS + logos storage policies
-- =============================================================================
--
-- WHY THIS MIGRATION EXISTS
-- ─────────────────────────
-- Migration 00050 attempted to fix the 42P17 infinite recursion but may have
-- been rolled back entirely if Part 4 (get_public_form_by_token) failed with
-- 42P13 before the fixes in Parts 1-3 were committed.
--
-- Additionally, is_company_member() was originally defined (00017, 00020) with:
--   • No SET search_path  → schema injection risk
--   • No explicit OWNER   → may be owned by a non-BYPASSRLS role, meaning
--                           SECURITY DEFINER does NOT bypass RLS
--
-- If the function owner lacks BYPASSRLS:
--   storage INSERT → logos policy → is_company_member() → queries companies
--   → companies SELECT policy (00001, if 00050 rolled back) → queries
--   company_members → company_members SELECT policy (self-referential, from 00001)
--   → infinite recursion → 42P17
--
-- FIX STRATEGY (defense in depth)
-- ────────────────────────────────
-- 1. Nuclear drop of ALL company_members policies (scan pg_policies)
--    Replace with single, trivial: user_id = auth.uid()
--
-- 2. Re-fix companies SELECT policy (in case 00050 rolled back)
--    Use is_company_member(id) — SECURITY DEFINER, queries account_memberships only
--
-- 3. Transfer ownership of is_company_member() and is_company_admin() to postgres
--    (postgres has BYPASSRLS, so SECURITY DEFINER truly bypasses RLS)
--    Recreate both with SET search_path = '' and fully-qualified names.
--
-- 4. Nuclear drop of ALL storage.objects policies for the logos bucket
--    Scan pg_policies for any policy touching bucket_id = 'logos'
--    Recreate exactly 4 clean policies (INSERT/SELECT/UPDATE/DELETE)
--
-- =============================================================================


-- =============================================================================
-- PART 1: Nuclear cleanup of company_members policies
-- =============================================================================

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
    RAISE NOTICE 'Dropped company_members policy: %', pol.policyname;
  END LOOP;
END $$;

-- Single, non-recursive policy: each user can only see their own membership row.
CREATE POLICY "company_members_select_own"
  ON public.company_members
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: authenticated users may only insert a row for themselves.
CREATE POLICY "company_members_insert_own"
  ON public.company_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE / DELETE: own row only (belt-and-suspenders).
CREATE POLICY "company_members_update_own"
  ON public.company_members
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "company_members_delete_own"
  ON public.company_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- PART 2: Re-fix companies SELECT policy (idempotent)
-- =============================================================================

DROP POLICY IF EXISTS "Users can view their companies"    ON public.companies;
DROP POLICY IF EXISTS "Users can view members of their companies" ON public.companies;

CREATE POLICY "Users can view their companies"
  ON public.companies
  FOR SELECT
  USING (public.is_company_member(id));


-- =============================================================================
-- PART 3: Harden is_company_member() and is_company_admin()
-- =============================================================================
-- We must DROP + CREATE (not CREATE OR REPLACE) only when the signature changes.
-- The signature here is unchanged (still returns boolean), so OR REPLACE is fine.
-- We use OR REPLACE to avoid issues if the function doesn't exist yet.
--
-- KEY CHANGES vs original (migrations 00017 / 00020):
--   a) OWNER TO postgres  — postgres has BYPASSRLS; SECURITY DEFINER will now
--      truly bypass RLS when the function runs internal queries.
--   b) SET search_path = ''  — prevents schema hijacking.
--   c) Fully-qualified table names: public.companies, public.account_memberships,
--      auth.uid() (already schema-qualified in Supabase).

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    INNER JOIN public.account_memberships am ON am.account_id = c.account_id
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
    FROM public.companies c
    INNER JOIN public.account_memberships am ON am.account_id = c.account_id
    WHERE c.id = p_company_id
      AND am.user_id = auth.uid()
      AND am.role = 'admin'
  );
$$;

ALTER FUNCTION public.is_company_admin(uuid) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.is_company_admin(uuid) TO authenticated, anon;


-- =============================================================================
-- PART 4: Nuclear cleanup of logos storage.objects policies
-- =============================================================================
-- Scan pg_policies for ALL policies on storage.objects that reference 'logos'
-- in any form (policy name, qual, or with_check expression).  Drop them all.
-- This catches any policies created through the Supabase dashboard as well.

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND (
        policyname  ILIKE '%logo%'
        OR qual      ILIKE '%logos%'
        OR with_check ILIKE '%logos%'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname
    );
    RAISE NOTICE 'Dropped storage.objects policy: %', pol.policyname;
  END LOOP;
END $$;

-- Recreate exactly 4 clean policies for the logos bucket.
-- Path layout: {company_id}/{form_id}/{timestamp}-{filename}
-- (storage.foldername(name))[1] = first path segment = company_id

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
-- Verification
-- =============================================================================
DO $$
DECLARE
  cm_policy_count   integer;
  logos_policy_count integer;
  bad_policy_count  integer;
BEGIN
  SELECT count(*) INTO cm_policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'company_members';

  SELECT count(*) INTO logos_policy_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename  = 'objects'
    AND (policyname ILIKE '%logo%' OR qual ILIKE '%logos%' OR with_check ILIKE '%logos%');

  -- Check for any remaining self-referential policies on company_members
  SELECT count(*) INTO bad_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'company_members'
    AND (qual ILIKE '%company_members%' OR with_check ILIKE '%company_members%');

  RAISE NOTICE '=== Migration 00051 complete ===';
  RAISE NOTICE 'company_members policies now: % (expect 4: select/insert/update/delete own-row)', cm_policy_count;
  RAISE NOTICE 'logos storage policies now: % (expect 4: insert/select/update/delete)', logos_policy_count;
  RAISE NOTICE 'Self-referential company_members policies remaining: % (expect 0)', bad_policy_count;
  RAISE NOTICE 'is_company_member() owner set to postgres (BYPASSRLS) — recursion eliminated';
  RAISE NOTICE 'is_company_admin()  owner set to postgres (BYPASSRLS) — recursion eliminated';

  IF bad_policy_count > 0 THEN
    RAISE WARNING 'STILL HAVE SELF-REFERENTIAL company_members POLICIES — check pg_policies manually!';
  END IF;
END $$;
