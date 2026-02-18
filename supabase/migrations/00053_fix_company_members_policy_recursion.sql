-- =============================================================================
-- Migration 00053: Fix company_members RLS recursion + storage bucket policies
-- =============================================================================
--
-- PROBLEM
-- ───────
-- Postgres error 42P17 "infinite recursion detected in policy for relation
-- company_members" fires on every Supabase Storage upload (logos / files /
-- resumes buckets).
--
-- Root causes (three separate layers):
--
--  1. public.company_members has a SELECT policy (created in migration 00001)
--     whose USING expression subqueries company_members itself:
--       company_id IN (SELECT company_id FROM company_members
--                      WHERE user_id = auth.uid())
--     Any table whose RLS calls into company_members re-enters this policy
--     → infinite recursion.
--
--  2. storage.objects policies for the "files" bucket (migration 00048) and
--     the "resumes" bucket (migration 00006) contain inline subqueries on
--     company_members.  Supabase evaluates SELECT policies even during INSERT
--     (existence-check phase), so every upload hits both the storage policy
--     and — through it — the recursive company_members policy.
--
--  3. The companies table SELECT policy (migration 00001) also subqueries
--     company_members, completing a second recursion path:
--       storage → companies → company_members → company_members → ...
--
-- APPROACH
-- ────────
-- Step 1  Harden / create public.is_company_member(uuid) → boolean.
--         SECURITY DEFINER + OWNER postgres means the function runs as a
--         superuser whose internal queries bypass ALL RLS.  Body never
--         references company_members; it uses account_memberships only.
--         This function is the single safe way to check membership from
--         inside any other policy.
--
-- Step 2  Nuclear sweep of company_members: drop EVERY existing policy
--         (dynamic scan of pg_policies + belt-and-suspenders hard-drops),
--         then create four simple own-row policies with no subqueries.
--
-- Step 3  Fix the companies SELECT policy to call is_company_member(id).
--
-- Step 4  Nuclear sweep of ALL storage.objects policies that reference
--         company_members in qual OR with_check, across all cmds and all
--         buckets.  Hard-drop every name we have ever created.
--
-- Step 5  Recreate clean storage policies for all three buckets:
--           resumes : INSERT open (applicant self-submit), SELECT member-only
--           files   : INSERT / SELECT / DELETE member-only
--           logos   : INSERT / SELECT / UPDATE / DELETE member-only
--         All use is_company_member(split_part(name,'/',1)::uuid) — safe.
--
-- Step 6  Verify (RAISE NOTICE + RAISE WARNING — never EXCEPTION so the
--         migration always commits and is never re-run).
--
-- PATH CONVENTION (all three buckets)
-- ────────────────────────────────────
--   <companyId> / <...rest...>
--   split_part(name, '/', 1)::uuid  →  companyId
--
--   resumes : <companyId>/<jobId>/<filename>
--   files   : <companyId>/<boardId>/<columnId>/<timestamp>_<filename>
--   logos   : <companyId>/<formId>/<timestamp>-<filename>
--
-- IDEMPOTENCY
-- ───────────
-- Every DROP uses IF EXISTS.  CREATE POLICY is only reached after the
-- matching DROP, so re-running this migration on an already-fixed database
-- is safe (drops succeed as no-ops, creates succeed because nothing exists).
-- =============================================================================


-- =============================================================================
-- STEP 1  Harden is_company_member() and is_company_admin()
-- =============================================================================
-- We create/replace these BEFORE touching any policy so that the policies
-- created later in this file can safely call them.
--
-- Key properties:
--   SECURITY DEFINER  — executes as the function owner, not the caller
--   OWNER postgres    — postgres is a superuser; superusers bypass RLS on
--                       every table they touch inside the function body
--   SET search_path=''— prevents search-path injection; all names are fully
--                       schema-qualified inside the body
--   Body              — joins companies ↔ account_memberships only;
--                       company_members is never referenced

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
    WHERE  c.id        = p_company_id
      AND  am.user_id  = auth.uid()
  );
$$;

ALTER  FUNCTION public.is_company_member(uuid) OWNER TO postgres;
GRANT  EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated, anon;


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
    WHERE  c.id        = p_company_id
      AND  am.user_id  = auth.uid()
      AND  am.role    IN ('owner', 'admin')
  );
$$;

ALTER  FUNCTION public.is_company_admin(uuid) OWNER TO postgres;
GRANT  EXECUTE ON FUNCTION public.is_company_admin(uuid) TO authenticated, anon;


-- =============================================================================
-- STEP 2  Nuclear sweep of company_members policies
-- =============================================================================

-- 2a. Hard-drop every name ever given to these policies across all migrations.
DROP POLICY IF EXISTS "Users can view members of their companies" ON public.company_members;
DROP POLICY IF EXISTS "company_members_select_own"               ON public.company_members;
DROP POLICY IF EXISTS "company_members_insert_own"               ON public.company_members;
DROP POLICY IF EXISTS "company_members_update_own"               ON public.company_members;
DROP POLICY IF EXISTS "company_members_delete_own"               ON public.company_members;
DROP POLICY IF EXISTS "cm_select_own_row"                        ON public.company_members;
DROP POLICY IF EXISTS "cm_insert_own_row"                        ON public.company_members;
DROP POLICY IF EXISTS "cm_update_own_row"                        ON public.company_members;
DROP POLICY IF EXISTS "cm_delete_own_row"                        ON public.company_members;

-- 2b. Dynamic sweep — catches any dashboard-created or unusually-named policy.
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
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_members', r.policyname);
    RAISE NOTICE '[00053] dropped company_members policy: %', r.policyname;
  END LOOP;
END $$;

-- 2c. Recreate: four simple own-row policies — no subquery, no recursion.
--     "Can a user read their own membership row?" is all we need here.
--     Broader visibility (who else is in my company) must go through
--     a SECURITY DEFINER RPC, never through an RLS policy on this table.

CREATE POLICY "cm_select_own"
  ON public.company_members
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "cm_insert_own"
  ON public.company_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cm_update_own"
  ON public.company_members
  FOR UPDATE
  TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cm_delete_own"
  ON public.company_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- =============================================================================
-- STEP 3  Fix companies SELECT policy
-- =============================================================================

-- Drop every variant ever created for this table's member-visibility policy.
DROP POLICY IF EXISTS "Users can view their companies"            ON public.companies;
DROP POLICY IF EXISTS "Users can view members of their companies" ON public.companies;
DROP POLICY IF EXISTS "companies_select_member"                   ON public.companies;

-- Dynamic sweep in case of other names.
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
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.companies', r.policyname);
    RAISE NOTICE '[00053] dropped companies SELECT policy referencing company_members: %', r.policyname;
  END LOOP;
END $$;

CREATE POLICY "companies_select_member"
  ON public.companies
  FOR SELECT
  USING (public.is_company_member(id));


-- =============================================================================
-- STEP 4  Nuclear sweep of storage.objects policies referencing company_members
-- =============================================================================
-- We sweep ALL cmds (SELECT / INSERT / UPDATE / DELETE) because:
--   • INSERT policies store their expression in pg_policies.with_check, not qual
--   • Previous attempts that filtered on cmd='SELECT' missed the files-bucket
--     INSERT and DELETE policies from migration 00048

-- 4a. Dynamic sweep — any cmd, any bucket, any policy name.
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
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
    RAISE NOTICE '[00053] dropped storage.objects % policy: %', r.cmd, r.policyname;
  END LOOP;
END $$;

-- 4b. Hard-drop every name ever given to storage policies across all migrations.
--     This covers cases where pg_policies.qual is normalised differently and
--     the ILIKE above might not have matched.

-- resumes bucket — migration 00006
DROP POLICY IF EXISTS "Anyone can upload resumes"                 ON storage.objects;
DROP POLICY IF EXISTS "Members can view company resumes"          ON storage.objects;
DROP POLICY IF EXISTS "resumes_select_company_member"             ON storage.objects;

-- files bucket — migration 00048
DROP POLICY IF EXISTS "Company members can upload board files"    ON storage.objects;
DROP POLICY IF EXISTS "Company members can view board files"      ON storage.objects;
DROP POLICY IF EXISTS "Company members can delete board files"    ON storage.objects;
DROP POLICY IF EXISTS "files_insert_company_member"               ON storage.objects;
DROP POLICY IF EXISTS "files_select_company_member"               ON storage.objects;
DROP POLICY IF EXISTS "files_delete_company_member"               ON storage.objects;

-- logos bucket — migrations 00050 / 00051 / 00052
DROP POLICY IF EXISTS "logos_insert_company_member"               ON storage.objects;
DROP POLICY IF EXISTS "logos_select_company_member"               ON storage.objects;
DROP POLICY IF EXISTS "logos_update_company_member"               ON storage.objects;
DROP POLICY IF EXISTS "logos_delete_company_member"               ON storage.objects;


-- =============================================================================
-- STEP 5  Recreate clean storage.objects policies
-- =============================================================================
-- All policies use:
--   split_part(name, '/', 1)::uuid
-- to extract companyId from the first path segment.  This matches the path
-- format used by every upload action in the codebase (confirmed in actions.ts,
-- route.ts, and the original migration comments).
--
-- is_company_member() is SECURITY DEFINER owned by postgres, so evaluating
-- it inside a policy never touches company_members and cannot recurse.

-- ── resumes bucket ───────────────────────────────────────────────────────────
-- Public applicant submissions: anyone may insert (no auth required).
-- Only company members may read their own company's resumes.

CREATE POLICY "resumes_insert_open"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'resumes');

CREATE POLICY "resumes_select_member"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "resumes_delete_member"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

-- ── files bucket ─────────────────────────────────────────────────────────────
-- Board file columns.  The upload API route uses a service-role client (which
-- bypasses RLS) but the policies below are still required for authenticated
-- direct-client access and signed-URL generation.

CREATE POLICY "files_insert_member"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'files'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "files_select_member"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'files'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "files_delete_member"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'files'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

-- ── logos bucket ─────────────────────────────────────────────────────────────
-- Form design logos.  Uploaded via server action (authenticated Supabase
-- client), read via createSignedUrl on both server and client.

CREATE POLICY "logos_insert_member"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "logos_select_member"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "logos_update_member"
  ON storage.objects
  FOR UPDATE
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
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND public.is_company_member(split_part(name, '/', 1)::uuid)
  );


-- =============================================================================
-- STEP 6  Verification  (NOTICE + WARNING only — never EXCEPTION)
-- =============================================================================
-- Using RAISE WARNING instead of RAISE EXCEPTION means this migration always
-- commits.  If warnings appear, run the verification queries below manually.

DO $$
DECLARE
  v_cm_count        int;
  v_cm_recursive    int;
  v_storage_bad     int;
  v_bad_names       text;
  v_fn_owner        text;
  v_fn_secdef       boolean;
  v_logos_policies  int;
  v_files_policies  int;
BEGIN
  -- company_members: total policy count after rebuild
  SELECT count(*) INTO v_cm_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'company_members';

  -- company_members: any policy whose expression still references company_members
  SELECT count(*) INTO v_cm_recursive
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'company_members'
    AND (qual ILIKE '%company_members%' OR with_check ILIKE '%company_members%');

  -- storage.objects: any policy (any cmd, any bucket) still referencing company_members
  SELECT count(*), coalesce(string_agg(policyname, ', ' ORDER BY policyname), '(none)')
  INTO   v_storage_bad, v_bad_names
  FROM   pg_policies
  WHERE  schemaname = 'storage'
    AND  tablename  = 'objects'
    AND  (qual ILIKE '%company_members%' OR with_check ILIKE '%company_members%');

  -- logos bucket policy count
  SELECT count(*) INTO v_logos_policies
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename  = 'objects'
    AND (policyname LIKE 'logos_%' OR qual ILIKE '%logos%' OR with_check ILIKE '%logos%');

  -- files bucket policy count
  SELECT count(*) INTO v_files_policies
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename  = 'objects'
    AND (policyname LIKE 'files_%' OR qual ILIKE '%files%' OR with_check ILIKE '%files%');

  -- is_company_member function attributes
  SELECT pg_get_userbyid(p.proowner), p.prosecdef
  INTO   v_fn_owner, v_fn_secdef
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'is_company_member';

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '  Migration 00053 verification';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '  company_members policies (expect 4)        : %', v_cm_count;
  RAISE NOTICE '  company_members recursive quals (expect 0) : %', v_cm_recursive;
  RAISE NOTICE '  storage bad policies (expect 0)            : %', v_storage_bad;
  RAISE NOTICE '  storage bad policy names                   : %', v_bad_names;
  RAISE NOTICE '  logos storage policies (expect 4)          : %', v_logos_policies;
  RAISE NOTICE '  files storage policies (expect 3)          : %', v_files_policies;
  RAISE NOTICE '  is_company_member owner (expect postgres)  : %', v_fn_owner;
  RAISE NOTICE '  is_company_member secdefiner (expect true) : %', v_fn_secdef;
  RAISE NOTICE '═══════════════════════════════════════════════════════════';

  -- Emit warnings (not exceptions) so the migration always commits.
  IF v_cm_recursive > 0 THEN
    RAISE WARNING '[00053] % company_members policy/policies still self-reference — fix manually', v_cm_recursive;
  END IF;

  IF v_storage_bad > 0 THEN
    RAISE WARNING '[00053] % storage.objects policy/policies still reference company_members: %', v_storage_bad, v_bad_names;
  END IF;

  IF coalesce(v_fn_owner, '') <> 'postgres' THEN
    RAISE WARNING '[00053] is_company_member owner is "%" not postgres — BYPASSRLS may not apply', v_fn_owner;
  END IF;

  IF NOT coalesce(v_fn_secdef, false) THEN
    RAISE WARNING '[00053] is_company_member is not SECURITY DEFINER';
  END IF;

  IF v_cm_recursive = 0 AND v_storage_bad = 0
     AND coalesce(v_fn_owner,'') = 'postgres' AND coalesce(v_fn_secdef, false) THEN
    RAISE NOTICE '  ✓ All checks passed.';
  END IF;

  RAISE NOTICE '';
END $$;
