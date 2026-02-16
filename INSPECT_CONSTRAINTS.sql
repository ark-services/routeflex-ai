-- ============================================================================
-- Inspect role constraints for account_memberships and company_members
-- ============================================================================

-- 1. Get the exact constraint definition for account_memberships.role
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.account_memberships'::regclass
  AND conname LIKE '%role%';

-- 2. Get column info for account_memberships.role
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'account_memberships'
  AND column_name = 'role';

-- 3. Get the exact constraint definition for company_members.role (if exists)
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.company_members'::regclass
  AND conname LIKE '%role%';

-- 4. Check if companies.account_id is NOT NULL
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'companies'
  AND column_name = 'account_id';

-- 5. Find the current handle_new_user function
SELECT
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'handle_new_user';

-- ============================================================================
-- Expected Results:
-- ============================================================================
-- account_memberships.role check: role in ('admin', 'member', 'viewer')
-- company_members.role check: role in ('owner', 'admin', 'member')
-- companies.account_id: NOT NULL = YES
-- ============================================================================
