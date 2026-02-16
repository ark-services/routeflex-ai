-- ============================================================================
-- Metering System Diagnostic Queries
-- Run these to diagnose why get_or_create_action_period is failing
-- ============================================================================

-- 1. Check if migration 00036 was applied
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version >= '00034'
ORDER BY version DESC;
-- Expected: Should see 00034, 00035, 00036

-- 2. Verify functions exist and are SECURITY DEFINER
SELECT
  routine_name,
  security_type,
  routine_definition LIKE '%security definer%' as mentions_security_definer
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_or_create_action_period', 'record_action_usage', 'get_billing_period')
ORDER BY routine_name;
-- Expected: security_type = 'DEFINER' for all three

-- 3. Check function grants
SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('get_or_create_action_period', 'record_action_usage', 'get_billing_period')
ORDER BY routine_name, grantee;
-- Expected: Should see 'authenticated' with 'EXECUTE' privilege

-- 4. Check RLS policies on metering tables
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('account_action_periods', 'account_action_ledger')
ORDER BY tablename, policyname;
-- Expected: Should see SELECT-only policies for authenticated users

-- 5. Check if account_action_periods table has FORCE ROW LEVEL SECURITY
SELECT
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('account_action_periods', 'account_action_ledger');
-- If forcerowsecurity = true, that could be an issue

-- 6. Test get_billing_period function directly
-- Replace YOUR_ACCOUNT_ID with your actual account UUID
SELECT * FROM get_billing_period('YOUR_ACCOUNT_ID'::uuid, now());
-- Expected: Returns period_start and period_end (1 month apart)

-- 7. Test get_or_create_action_period function directly
-- Replace YOUR_ACCOUNT_ID with your actual account UUID
SELECT * FROM get_or_create_action_period('YOUR_ACCOUNT_ID'::uuid, now());
-- Expected: Returns period data without RLS errors

-- 8. Check if billing_anchor_day is set
-- Replace YOUR_ACCOUNT_ID with your actual account UUID
SELECT id, name, plan_type, billing_anchor_day, created_at
FROM accounts
WHERE id = 'YOUR_ACCOUNT_ID'::uuid;
-- Expected: billing_anchor_day should be between 1-28

-- 9. Check function owner
SELECT
  p.proname as function_name,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('get_or_create_action_period', 'record_action_usage', 'get_billing_period')
ORDER BY p.proname;
-- Expected: owner = 'postgres' (or supabase_admin), is_security_definer = true

-- 10. Try to manually insert a period row (as authenticated user)
-- This SHOULD fail with RLS error if policies are working correctly
-- Replace YOUR_ACCOUNT_ID with your actual account UUID
/*
INSERT INTO account_action_periods (account_id, period_start, period_end, quota_units)
VALUES (
  'YOUR_ACCOUNT_ID'::uuid,
  now(),
  now() + interval '1 month',
  3000
);
*/
-- Expected: RLS error (this is CORRECT - direct inserts should be blocked)
-- Functions bypass RLS via SECURITY DEFINER
