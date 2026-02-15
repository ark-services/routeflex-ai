-- ============================================================================
-- DIAGNOSTIC QUERIES - Run these to find why applicants aren't showing
-- ============================================================================

-- Query 1: Check if helper functions exist and work
-- (Replace YOUR_COMPANY_ID with your actual company UUID)
SELECT
  'Helper Functions Test' as test_name,
  public.is_company_member('YOUR_COMPANY_ID'::uuid) as is_member,
  public.is_company_admin('YOUR_COMPANY_ID'::uuid) as is_admin,
  auth.uid() as current_user_id;

-- Query 2: Check your account membership
SELECT
  'Account Membership' as test_name,
  am.user_id,
  am.role,
  am.account_id,
  c.id as company_id,
  c.name as company_name
FROM account_memberships am
JOIN companies c ON c.account_id = am.account_id
WHERE am.user_id = auth.uid();

-- Query 3: Check if applicants exist (bypassing RLS)
-- (Replace YOUR_JOB_ID with your actual job UUID)
SELECT
  'Applicants Count (No RLS)' as test_name,
  COUNT(*) as total_applicants,
  COUNT(DISTINCT company_id) as companies,
  COUNT(DISTINCT job_id) as jobs,
  COUNT(DISTINCT board_id) as boards,
  COUNT(DISTINCT group_id) as groups
FROM applicants
WHERE job_id = 'YOUR_JOB_ID'::uuid;

-- Query 4: Check if boards exist for the job
-- (Replace YOUR_COMPANY_ID and YOUR_JOB_ID)
SELECT
  'Boards for Job' as test_name,
  b.id as board_id,
  b.name as board_name,
  b.company_id,
  b.job_id,
  b.created_at
FROM boards b
WHERE b.company_id = 'YOUR_COMPANY_ID'::uuid
  AND b.job_id = 'YOUR_JOB_ID'::uuid;

-- Query 5: Check if board_groups exist
-- (Replace YOUR_BOARD_ID from Query 4 result)
SELECT
  'Board Groups' as test_name,
  bg.id as group_id,
  bg.name as group_name,
  bg.board_id,
  bg.company_id,
  bg.sort_order,
  bg.color
FROM board_groups bg
WHERE bg.board_id = 'YOUR_BOARD_ID'::uuid
ORDER BY bg.sort_order;

-- Query 6: Check applicants with their board assignments
-- (Replace YOUR_JOB_ID)
SELECT
  'Applicants Detail' as test_name,
  a.id,
  a.full_name,
  a.email,
  a.company_id,
  a.job_id,
  a.board_id,
  a.group_id,
  a.position,
  a.created_at,
  bg.name as group_name
FROM applicants a
LEFT JOIN board_groups bg ON bg.id = a.group_id
WHERE a.job_id = 'YOUR_JOB_ID'::uuid
ORDER BY a.created_at DESC;

-- Query 7: Check RLS policies are active
SELECT
  'RLS Policies' as test_name,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('boards', 'board_groups', 'applicants', 'board_columns', 'board_cells')
ORDER BY tablename, cmd, policyname;

-- Query 8: Test if you can select from boards table with RLS
-- (Replace YOUR_COMPANY_ID)
SELECT
  'Can Select Boards (With RLS)' as test_name,
  COUNT(*) as boards_visible,
  array_agg(id) as board_ids
FROM boards
WHERE company_id = 'YOUR_COMPANY_ID'::uuid;

-- Query 9: Test if you can select from board_groups table with RLS
-- (Replace YOUR_COMPANY_ID)
SELECT
  'Can Select Board Groups (With RLS)' as test_name,
  COUNT(*) as groups_visible,
  array_agg(name) as group_names
FROM board_groups
WHERE company_id = 'YOUR_COMPANY_ID'::uuid;

-- Query 10: Test if you can select from applicants table with RLS
-- (Replace YOUR_COMPANY_ID and YOUR_JOB_ID)
SELECT
  'Can Select Applicants (With RLS)' as test_name,
  COUNT(*) as applicants_visible,
  array_agg(full_name) as applicant_names
FROM applicants
WHERE company_id = 'YOUR_COMPANY_ID'::uuid
  AND job_id = 'YOUR_JOB_ID'::uuid;
