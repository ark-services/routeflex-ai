-- ============================================================================
-- Check for group_id mismatches between applicants and board_groups
-- This query identifies applicants whose group_id doesn't match any actual group
-- ============================================================================

-- Replace these with your actual UUIDs:
-- YOUR_COMPANY_ID: from companies table
-- YOUR_JOB_ID: from jobs table
-- YOUR_BOARD_ID: from boards table

-- Step 1: Check what board_groups exist for this board
SELECT
  'Board Groups for this Job' as check_type,
  bg.id as group_id,
  bg.name as group_name,
  bg.board_id,
  bg.company_id,
  bg.sort_order,
  bg.created_at
FROM board_groups bg
WHERE bg.company_id = 'YOUR_COMPANY_ID'::uuid
  AND bg.board_id = 'YOUR_BOARD_ID'::uuid
ORDER BY bg.sort_order;

-- Step 2: Check applicants and their group assignments
SELECT
  'Applicants for this Job' as check_type,
  a.id as applicant_id,
  a.full_name,
  a.email,
  a.job_id,
  a.board_id,
  a.group_id,
  a.position,
  a.created_at,
  bg.name as assigned_group_name,
  CASE
    WHEN a.group_id IS NULL THEN 'NULL group_id'
    WHEN bg.id IS NULL THEN 'ORPHANED (group does not exist)'
    WHEN a.board_id != bg.board_id THEN 'WRONG BOARD'
    ELSE 'OK'
  END as status
FROM applicants a
LEFT JOIN board_groups bg ON bg.id = a.group_id
WHERE a.company_id = 'YOUR_COMPANY_ID'::uuid
  AND a.job_id = 'YOUR_JOB_ID'::uuid
ORDER BY a.created_at DESC;

-- Step 3: Find orphaned applicants (group_id points to non-existent group)
SELECT
  'Orphaned Applicants' as check_type,
  a.id as applicant_id,
  a.full_name,
  a.group_id as invalid_group_id,
  a.board_id,
  'Group does not exist in board_groups table' as issue
FROM applicants a
WHERE a.company_id = 'YOUR_COMPANY_ID'::uuid
  AND a.job_id = 'YOUR_JOB_ID'::uuid
  AND a.group_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM board_groups bg
    WHERE bg.id = a.group_id
  );

-- Step 4: Find applicants assigned to groups from the wrong board
SELECT
  'Wrong Board Assignment' as check_type,
  a.id as applicant_id,
  a.full_name,
  a.board_id as applicant_board_id,
  bg.board_id as group_board_id,
  bg.name as group_name,
  'Applicant board_id does not match group board_id' as issue
FROM applicants a
JOIN board_groups bg ON bg.id = a.group_id
WHERE a.company_id = 'YOUR_COMPANY_ID'::uuid
  AND a.job_id = 'YOUR_JOB_ID'::uuid
  AND a.board_id != bg.board_id;

-- Step 5: Count applicants per group (expected distribution)
SELECT
  'Expected Distribution' as check_type,
  bg.name as group_name,
  bg.id as group_id,
  COUNT(a.id) as applicant_count,
  array_agg(a.full_name ORDER BY a.position) FILTER (WHERE a.id IS NOT NULL) as applicant_names
FROM board_groups bg
LEFT JOIN applicants a ON a.group_id = bg.id AND a.job_id = 'YOUR_JOB_ID'::uuid
WHERE bg.company_id = 'YOUR_COMPANY_ID'::uuid
  AND bg.board_id = 'YOUR_BOARD_ID'::uuid
GROUP BY bg.id, bg.name, bg.sort_order
ORDER BY bg.sort_order;
