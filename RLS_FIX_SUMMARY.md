# Fix: Applicants Not Showing in Dashboard (RLS Issue)

## Problem

**Confirmed in DB**:
- 2 applicants exist for job `a08795a8-2604-4a7d-a10a-252a9ceb735d`
- Each has correct `job_id`, `board_id`, `group_id`, `company_id`, `position`
- Board exists: `1412294c-2fb3-46be-bb06-b68812d48483`
- 4 groups exist (New Applicants, Background Check, Interview, HR Paperwork)

**Symptom in UI**:
- Dashboard showed all groups with "(0)" count
- No applicant cards displayed
- Public apply said "Application Submitted!" but nothing appeared

**Data was correct, UI query was being blocked by RLS!**

---

## Root Cause: RLS Policy Mismatch

### The Old Policy (BROKEN)
From `00006_applicants.sql`:
```sql
create policy "Members can view company applicants"
  on public.applicants
  for select
  using (
    company_id in (
      select company_id
      from public.company_members  -- ❌ OLD TABLE
      where user_id = auth.uid()
    )
  );
```

### The System Now Uses
From `00017_fix_form_engine_rls.sql`:
```sql
create function public.is_company_member(p_company_id uuid)
returns boolean
as $$
  select exists (
    select 1
    from public.companies c
    inner join public.account_memberships am  -- ✅ NEW TABLE
      on am.account_id = c.account_id
    where c.id = p_company_id
      and am.user_id = auth.uid()
  );
$$;
```

### Why It Failed
1. Dashboard auth check: Uses `account_memberships` → passes ✓
2. RLS policy check: Uses old `company_members` table → fails ✗
3. SELECT returns 0 rows (blocked by RLS)
4. UI shows empty board

---

## Solution Implemented

### 1. Migration: `00019_fix_applicants_rls.sql`

**Updated RLS policies to use helper functions**:

```sql
-- Drop old policy using company_members
drop policy if exists "Members can view company applicants" on public.applicants;

-- Create new policy using is_company_member helper
create policy "Members can view company applicants"
  on public.applicants
  for select
  using (public.is_company_member(company_id));

-- Update policy for updates
create policy "Members can update company applicants"
  on public.applicants
  for update
  using (public.is_company_member(company_id));

-- Add delete policy for admins
create policy "Admins can delete applicants"
  on public.applicants
  for delete
  using (public.is_company_admin(company_id));
```

**Benefits**:
- ✅ Consistent with rest of system (forms, fields, board_groups, etc.)
- ✅ Uses `account_memberships` table (current system)
- ✅ Works with existing auth flow
- ✅ Public apply still works (has separate INSERT policy with `true`)

### 2. Enhanced Logging in `page.tsx`

**Added comprehensive server-side logs**:

```typescript
console.log('[Applicants Page] Board and groups loaded:', {
  boardId: board.id,
  groupCount: groups.length,
  groupNames: groups.map(g => ({ id: g.id, name: g.name })),
  companyId,
  jobId,
});

console.log('[Applicants Page] Applicants fetched:', {
  count: applicants?.length || 0,
  sample: applicants?.slice(0, 3).map(a => ({
    id: a.id,
    name: a.full_name,
    group_id: a.group_id,
    board_id: a.board_id,
    position: a.position,
  })) || [],
});

// Plus logs for columns, cells, and final summary
```

**Error logging**:
```typescript
console.error('[Applicants Page] ERROR fetching applicants:', {
  error: appErr,
  message: appErr.message,
  code: appErr.code,
  details: appErr.details,
  hint: appErr.hint,
  companyId,
  jobId,
});
```

### 3. Fixed Board Columns Query

**Before (too broad)**:
```typescript
.eq("company_id", companyId)  // Gets columns for ALL boards in company
```

**After (job-specific)**:
```typescript
.eq("board_id", board.id)  // Gets columns only for THIS job's board
```

### 4. Added Path Revalidation

**In public apply submission**:
```typescript
// After successful submission
revalidatePath(`/dashboard/${form.company_id}/jobs/${jobId}/applicants`);
console.log('[Application Submit] Revalidated applicants board path');
```

**Benefit**: Dashboard auto-refreshes after new submission (no manual refresh needed)

---

## Files Changed

```diff
✅ supabase/migrations/00019_fix_applicants_rls.sql (NEW)
   + Updated SELECT policy to use is_company_member
   + Updated UPDATE policy to use is_company_member
   + Added DELETE policy for admins

✅ src/app/dashboard/[companyId]/jobs/[jobId]/applicants/page.tsx
   + Added comprehensive logging (board, groups, applicants, columns, cells)
   + Added error logging with full details
   + Fixed board_columns query to filter by board_id
   + Added board_id to applicants SELECT

✅ src/app/apply/[jobId]/[token]/actions.ts
   + Added revalidatePath after successful submission
   + Added logging for revalidation
```

---

## How to Deploy & Test

### Step 1: Run Migration
```bash
# Via Supabase CLI
supabase db push

# Or via Supabase Dashboard SQL Editor
# Paste contents of 00019_fix_applicants_rls.sql
```

### Step 2: Verify Migration Applied
```sql
-- Check new policies exist
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'applicants'
ORDER BY policyname;

-- Expected output:
-- "Admins can delete applicants" (DELETE)
-- "Anyone can submit applications" (INSERT)
-- "Members can update company applicants" (UPDATE)
-- "Members can view company applicants" (SELECT)
```

### Step 3: Test the Fix

#### Test 1: Dashboard Shows Existing Applicants
1. Navigate to `/dashboard/{companyId}/jobs/{jobId}/applicants`
2. **Expected**: Board shows 2 applicants in "New Applicants" group
3. **Check logs** (server console):
   ```
   [Applicants Page] Board and groups loaded: { boardId: ..., groupCount: 4, ... }
   [Applicants Page] Applicants fetched: { count: 2, sample: [...] }
   [Applicants Page] Final data summary: { boardId: ..., applicants: 2, ... }
   ```

#### Test 2: Submit New Application
1. Go to public apply link: `/apply/{jobId}/{token}`
2. Fill out form and submit
3. **Expected**: "Application Submitted!" message
4. **Check logs** (server console):
   ```
   [Application Submit] SUCCESS: { applicantId: ..., fieldsInserted: 11 }
   [Application Submit] Revalidated applicants board path
   ```
5. Refresh dashboard (or wait for auto-revalidation)
6. **Expected**: New applicant appears in "New Applicants" group
7. **Expected**: Group count shows "(3)"

#### Test 3: Verify with SQL
```sql
-- Check applicants are linked correctly
SELECT
  a.id,
  a.full_name,
  a.email,
  a.job_id,
  a.board_id,
  a.group_id,
  a.position,
  bg.name as group_name
FROM applicants a
JOIN board_groups bg ON bg.id = a.group_id
WHERE a.job_id = 'a08795a8-2604-4a7d-a10a-252a9ceb735d'
ORDER BY a.position;

-- Expected: All applicants with group_name = "New Applicants"
```

---

## What the Logs Should Show

### Successful Page Load:
```
[Applicants Page] Board and groups loaded: {
  boardId: '1412294c-2fb3-46be-bb06-b68812d48483',
  groupCount: 4,
  groupNames: [
    { id: '7c826f9b-5f32-4380-a830-e2d4c22c6070', name: 'New Applicants' },
    { id: '...', name: 'Background Check' },
    { id: '...', name: 'Interview' },
    { id: '...', name: 'HR Paperwork' }
  ],
  companyId: '...',
  jobId: 'a08795a8-2604-4a7d-a10a-252a9ceb735d'
}

[Applicants Page] Applicants fetched: {
  count: 2,
  sample: [
    {
      id: '...',
      name: 'John Doe',
      group_id: '7c826f9b-5f32-4380-a830-e2d4c22c6070',
      board_id: '1412294c-2fb3-46be-bb06-b68812d48483',
      position: 0
    },
    {
      id: '...',
      name: 'Jane Smith',
      group_id: '7c826f9b-5f32-4380-a830-e2d4c22c6070',
      board_id: '1412294c-2fb3-46be-bb06-b68812d48483',
      position: 1
    }
  ]
}

[Applicants Page] Columns fetched: {
  count: 12,
  columnNames: ['First Name', 'Last Name', 'Email', 'Phone', ..., 'Status']
}

[Applicants Page] Cells fetched: {
  count: 24  // 2 applicants × 12 columns
}

[Applicants Page] Final data summary: {
  boardId: '1412294c-2fb3-46be-bb06-b68812d48483',
  groups: 4,
  applicants: 2,
  columns: 12,
  cells: 24
}
```

### If RLS Still Blocking:
```
[Applicants Page] ERROR fetching applicants: {
  error: { ... },
  message: 'permission denied for table applicants',
  code: '42501',
  details: null,
  hint: null,
  companyId: '...',
  jobId: '...'
}
```

If you see this, the migration didn't apply or `is_company_member` function is missing.

---

## Troubleshooting

### Issue: Still showing 0 applicants after migration

**Check 1: Is user a company member?**
```sql
SELECT
  c.id as company_id,
  c.name as company_name,
  a.id as account_id,
  am.user_id,
  am.role
FROM companies c
JOIN accounts a ON a.id = c.account_id
JOIN account_memberships am ON am.account_id = a.id
WHERE am.user_id = auth.uid()  -- Replace with actual user UUID
  AND c.id = '{companyId}';

-- Should return at least 1 row
```

**Check 2: Does is_company_member function exist?**
```sql
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'is_company_member';

-- Should return the function definition
```

**Check 3: Test the function directly**
```sql
SELECT public.is_company_member('{companyId}');

-- Should return: true
```

**Check 4: Are RLS policies active?**
```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'applicants';
```

### Issue: Applicants show but no field values

**Check**: Are applicant_field_values being saved?
```sql
SELECT COUNT(*)
FROM applicant_field_values
WHERE applicant_id = '{applicantId}';

-- Should be > 0
```

If 0, check the public apply submission logs.

---

## Success Criteria

✅ **Dashboard loads without errors**
✅ **Applicants appear under correct groups**
✅ **Group counts show correct numbers**: "(2)" not "(0)"
✅ **New submissions appear immediately** (via revalidation)
✅ **Logs show**:
- Board loaded
- Groups loaded (4)
- Applicants fetched (2+)
- No RLS errors

✅ **SQL verification**:
```sql
-- All applicants visible
SELECT COUNT(*) FROM applicants WHERE job_id = '{jobId}';
-- Returns: 2+

-- All have group linkage
SELECT COUNT(*) FROM applicants
WHERE job_id = '{jobId}' AND group_id IS NOT NULL;
-- Returns: 2+

-- RLS allows SELECT
SELECT * FROM applicants WHERE job_id = '{jobId}';
-- Returns: Rows (not permission error)
```

---

**Date**: 2026-02-14
**Status**: ✅ Fixed
**Commit**: `fa220fe` Fix applicants not showing in dashboard due to RLS policy mismatch
