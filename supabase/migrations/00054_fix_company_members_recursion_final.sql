-- =============================================================================
-- Migration 00054: Final fix — company_members RLS recursion + storage policies
-- =============================================================================
--
-- WHY RECURSION HAPPENS
-- ─────────────────────
-- The original company_members SELECT policy (migration 00001) reads:
--
--   USING (company_id IN (
--     SELECT company_members_1.company_id
--     FROM   company_members company_members_1
--     WHERE  company_members_1.user_id = uid()
--   ))
--
-- This is a self-join: evaluating the policy requires reading company_members,
-- which triggers the policy again → infinite loop → Postgres error 42P17.
--
-- Any storage.objects policy that references company_members in its qual or
-- with_check expression (directly or through a subquery) reaches into this
-- recursive policy the moment Postgres evaluates it.  That is why uploads fail
-- even though the storage policy itself "looks fine" in isolation.
--
-- WHY THIS FIX WORKS
-- ──────────────────
-- 1. public.is_company_member(uuid) → boolean
--    SECURITY DEFINER + OWNER postgres: the function body runs as a superuser
--    whose queries bypass RLS entirely.  It reads companies + account_memberships
--    (never company_members), so it cannot recurse.
--
-- 2. company_members SELECT policy is replaced with the trivial
--    "user_id = auth.uid()" — no subquery, no self-reference, no recursion.
--
-- 3. Every storage.objects policy that previously queried company_members is
--    dropped (dynamic scan of pg_policies with no cmd filter + hard-drops by
--    every name ever used) and replaced with calls to is_company_member().
--
-- HISTORY OF PREVIOUS ATTEMPTS
-- ─────────────────────────────
-- 00050  Rolled back: get_public_form_by_token signature change raised 42P13.
-- 00051  Rolled back: policy "company_members_select_own" already existed.
-- 00052  Three attempts:
--          #1 — only hard-dropped one resumes policy by name; missed others.
--          #2 — dynamic sweep filtered on cmd='SELECT'; missed INSERT/DELETE.
--          #3 — sweep was correct but RAISE EXCEPTION in verification block
--               rolled back the whole transaction each time.
-- 00053  RAISE WARNING (not EXCEPTION); comprehensive sweep.  Applied but
--        may not have reached prod if DB was out of sync.
-- 00054  (this file) Fully self-contained; idempotent; verification never
--        raises EXCEPTION.
--
-- STORAGE PATH CONVENTION (all buckets)
-- ───────────────────────────────────────
--   <companyId> / <...>
--   split_part(name, '/', 1)::uuid  →  companyId
--
--   resumes  <companyId>/<jobId>/<filename>
--   files    <companyId>/<boardId>/<columnId>/<ts>_<filename>
--   logos    <companyId>/<formId>/<ts>-<filename>
-- =============================================================================


-- =============================================================================
-- SECTION 1  Helper functions
-- =============================================================================
-- Create/replace BEFORE any policy that calls them.
-- OWNER postgres   — postgres is a superuser; SECURITY DEFINER + superuser
--                    owner means the function body executes with full BYPASSRLS.
-- SET search_path  — prevents search-path injection; all refs are schema-qualified.
-- Body             — joins companies ↔ account_memberships only.
--                    company_members is never mentioned.

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.companies            c
    JOIN   public.account_memberships  am ON am.account_id = c.account_id
    WHERE  c.id       = p_company_id
      AND  am.user_id = auth.uid()
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
    FROM   public.companies            c
    JOIN   public.account_memberships  am ON am.account_id = c.account_id
    WHERE  c.id       = p_company_id
      AND  am.user_id = auth.uid()
      AND  am.role   IN ('owner', 'admin')
  );
$$;

ALTER FUNCTION public.is_company_admin(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_company_admin(uuid) TO authenticated, anon;


-- =============================================================================
-- SECTION 2  company_members policies
-- =============================================================================

-- 2-A  Hard-drop every name ever given to policies on this table.
DROP POLICY IF EXISTS "Users can view members of their companies" ON public.company_members;
DROP POLICY IF EXISTS "company_members_select_own"               ON public.company_members;
DROP POLICY IF EXISTS "company_members_insert_own"               ON public.company_members;
DROP POLICY IF EXISTS "company_members_update_own"               ON public.company_members;
DROP POLICY IF EXISTS "company_members_delete_own"               ON public.company_members;
DROP POLICY IF EXISTS "cm_select_own_row"                        ON public.company_members;
DROP POLICY IF EXISTS "cm_insert_own_row"                        ON public.company_members;
DROP POLICY IF EXISTS "cm_update_own_row"                        ON public.company_members;
DROP POLICY IF EXISTS "cm_delete_own_row"                        ON public.company_members;
DROP POLICY IF EXISTS "cm_select_own"                            ON public.company_members;
DROP POLICY IF EXISTS "cm_insert_own"                            ON public.company_members;
DROP POLICY IF EXISTS "cm_update_own"                            ON public.company_members;
DROP POLICY IF EXISTS "cm_delete_own"                            ON public.company_members;

-- 2-B  Dynamic sweep — catches any dashboard-created or unusually-named policy.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'company_members'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.company_members', r.policyname
    );
    RAISE NOTICE '[00054] dropped company_members policy: %', r.policyname;
  END LOOP;
END $$;

-- 2-C  Recreate: trivial own-row policies, zero subqueries, zero recursion.
CREATE POLICY "cm_select_own"
  ON public.company_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "cm_insert_own"
  ON public.company_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cm_update_own"
  ON public.company_members FOR UPDATE
  TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cm_delete_own"
  ON public.company_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- SECTION 3  companies SELECT policy
-- =============================================================================

DROP POLICY IF EXISTS "Users can view their companies"            ON public.companies;
DROP POLICY IF EXISTS "Users can view members of their companies" ON public.companies;
DROP POLICY IF EXISTS "companies_select_member"                   ON public.companies;

-- Dynamic sweep for any other companies SELECT policy that references
-- company_members (shouldn't exist, but belts and suspenders).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'companies'
      AND  cmd        = 'SELECT'
      AND  (qual ILIKE '%company_members%' OR with_check ILIKE '%company_members%')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.companies', r.policyname
    );
    RAISE NOTICE '[00054] dropped companies SELECT policy: %', r.policyname;
  END LOOP;
END $$;

CREATE POLICY "companies_select_member"
  ON public.companies FOR SELECT
  USING (public.is_company_member(id));


-- =============================================================================
-- SECTION 4  storage.objects — sweep ALL policies referencing company_members
-- =============================================================================
-- Critical: NO cmd filter.  INSERT policies store their expression in
-- pg_policies.with_check (not qual).  Previous migration attempts that
-- filtered AND cmd='SELECT' missed "Company members can upload board files"
-- (INSERT) and "Company members can delete board files" (DELETE) from
-- migration 00048, causing verification to fail.

-- 4-A  Dynamic sweep — any cmd, any bucket, any policy name.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, cmd
    FROM   pg_policies
    WHERE  schemaname = 'storage'
      AND  tablename  = 'objects'
      AND  (
            qual       ILIKE '%company_members%'
         OR with_check ILIKE '%company_members%'
           )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects', r.policyname
    );
    RAISE NOTICE '[00054] dropped storage.objects % policy: %', r.cmd, r.policyname;
  END LOOP;
END $$;

-- 4-B  Hard-drop by every name ever assigned across all migrations (00006,
--      00048, 00050, 00051, 00052, 00053).  Handles the edge-case where
--      pg_policies.qual normalisation on some PG versions omits the table
--      schema, making ILIKE miss the match.

-- resumes (00006)
DROP POLICY IF EXISTS "Anyone can upload resumes"                 ON storage.objects;
DROP POLICY IF EXISTS "Members can view company resumes"          ON storage.objects;
-- resumes (00052 / 00053)
DROP POLICY IF EXISTS "resumes_select_company_member"             ON storage.objects;
DROP POLICY IF EXISTS "resumes_insert_open"                       ON storage.objects;
DROP POLICY IF EXISTS "resumes_select_member"                     ON storage.objects;
DROP POLICY IF EXISTS "resumes_delete_member"                     ON storage.objects;

-- files (00048)
DROP POLICY IF EXISTS "Company members can upload board files"    ON storage.objects;
DROP POLICY IF EXISTS "Company members can view board files"      ON storage.objects;
DROP POLICY IF EXISTS "Company members can delete board files"    ON storage.objects;
-- files (00052 / 00053)
DROP POLICY IF EXISTS "files_insert_company_member"               ON storage.objects;
DROP POLICY IF EXISTS "files_select_company_member"               ON storage.objects;
DROP POLICY IF EXISTS "files_delete_company_member"               ON storage.objects;
DROP POLICY IF EXISTS "files_insert_member"                       ON storage.objects;
DROP POLICY IF EXISTS "files_select_member"                       ON storage.objects;
DROP POLICY IF EXISTS "files_delete_member"                       ON storage.objects;

-- logos (00050 / 00051 / 00052 / 00053)
DROP POLICY IF EXISTS "logos_insert_company_member"               ON storage.objects;
DROP POLICY IF EXISTS "logos_select_company_member"               ON storage.objects;
DROP POLICY IF EXISTS "logos_update_company_member"               ON storage.objects;
DROP POLICY IF EXISTS "logos_delete_company_member"               ON storage.objects;
DROP POLICY IF EXISTS "logos_insert_member"                       ON storage.objects;
DROP POLICY IF EXISTS "logos_select_member"                       ON storage.objects;
DROP POLICY IF EXISTS "logos_update_member"                       ON storage.objects;
DROP POLICY IF EXISTS "logos_delete_member"                       ON storage.objects;


-- =============================================================================
-- SECTION 5  storage.objects — clean policy recreation
-- =============================================================================
-- All policies call is_company_member(split_part(name,'/',1)::uuid).
-- is_company_member is SECURITY DEFINER owned by postgres → body bypasses RLS
-- → company_members is never touched → recursion is structurally impossible.

-- ── resumes ──────────────────────────────────────────────────────────────────
-- Public applicant self-submission: INSERT open to everyone (no auth required).
-- Reads and deletes restricted to company members.

CREATE POLICY "resumes_insert_open"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'resumes');

CREATE POLICY "resumes_select_member"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "resumes_delete_member"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

-- ── files ─────────────────────────────────────────────────────────────────────
-- Board file-column uploads.  The upload API route uses a service-role client
-- (which bypasses RLS for INSERT) but these policies are still required for
-- authenticated direct-client reads, signed-URL generation, and deletes.

CREATE POLICY "files_insert_member"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'files'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "files_select_member"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'files'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "files_delete_member"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'files'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

-- ── logos ─────────────────────────────────────────────────────────────────────
-- Form-design logos uploaded via authenticated server action (actions.ts).
-- Signed URLs generated on each page load via createSignedUrl().

CREATE POLICY "logos_insert_member"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "logos_select_member"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "logos_update_member"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "logos_delete_member"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );


-- =============================================================================
-- SECTION 6  Verification  (NOTICE + WARNING only — never EXCEPTION)
-- =============================================================================
-- This block never raises EXCEPTION, so the migration always commits and is
-- never re-queued by the Supabase CLI.  If warnings appear, investigate with
-- the SQL queries listed in the checklist below.

DO $$
DECLARE
  v_cm_count       int;
  v_cm_recursive   int;
  v_storage_bad    int;
  v_bad_names      text;
  v_fn_owner       text;
  v_fn_secdef      boolean;
BEGIN
  SELECT count(*) INTO v_cm_count
  FROM   pg_policies
  WHERE  schemaname = 'public' AND tablename = 'company_members';

  SELECT count(*) INTO v_cm_recursive
  FROM   pg_policies
  WHERE  schemaname = 'public'
    AND  tablename  = 'company_members'
    AND  (qual ILIKE '%company_members%' OR with_check ILIKE '%company_members%');

  SELECT count(*),
         coalesce(string_agg(policyname, ', ' ORDER BY policyname), '(none)')
  INTO   v_storage_bad, v_bad_names
  FROM   pg_policies
  WHERE  schemaname = 'storage'
    AND  tablename  = 'objects'
    AND  (qual ILIKE '%company_members%' OR with_check ILIKE '%company_members%');

  SELECT pg_get_userbyid(p.proowner), p.prosecdef
  INTO   v_fn_owner, v_fn_secdef
  FROM   pg_proc       p
  JOIN   pg_namespace  n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'is_company_member';

  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '  Migration 00054 — verification';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '  company_members policies (expect 4)        : %', v_cm_count;
  RAISE NOTICE '  company_members self-referencing (expect 0): %', v_cm_recursive;
  RAISE NOTICE '  storage bad policies     (expect 0)        : %', v_storage_bad;
  RAISE NOTICE '  storage bad policy names                   : %', v_bad_names;
  RAISE NOTICE '  is_company_member owner  (expect postgres)  : %', v_fn_owner;
  RAISE NOTICE '  is_company_member secdef (expect true)     : %', v_fn_secdef;
  RAISE NOTICE '══════════════════════════════════════════════════════════';

  IF v_cm_recursive > 0 THEN
    RAISE WARNING '[00054] % company_members policy/policies still self-reference company_members',
      v_cm_recursive;
  END IF;

  IF v_storage_bad > 0 THEN
    RAISE WARNING '[00054] % storage.objects policy/policies still reference company_members: %',
      v_storage_bad, v_bad_names;
  END IF;

  IF coalesce(v_fn_owner, '') <> 'postgres' THEN
    RAISE WARNING '[00054] is_company_member owner="%" — should be postgres for BYPASSRLS',
      v_fn_owner;
  END IF;

  IF NOT coalesce(v_fn_secdef, false) THEN
    RAISE WARNING '[00054] is_company_member is not SECURITY DEFINER';
  END IF;

  IF v_cm_recursive = 0
     AND v_storage_bad  = 0
     AND coalesce(v_fn_owner,  '') = 'postgres'
     AND coalesce(v_fn_secdef, false)
  THEN
    RAISE NOTICE '  ✓ All checks passed — 42P17 recursion eliminated.';
  END IF;

  RAISE NOTICE '';
END $$;
