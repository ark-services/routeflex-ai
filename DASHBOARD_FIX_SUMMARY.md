# Dashboard Crash Fix - Self-Healing Board Creation

## Problem

Dashboard route crashed with error:
```
"Applicants board not found. Please recreate the job."
```

Location: `src/app/dashboard/[companyId]/jobs/[jobId]/applicants/page.tsx` line ~59

## Root Causes Identified

1. **Schema Bug**: `board_groups` table missing `board_id` column
   - Code expected `board_groups.board_id` but column never added
   - Job creation tried to insert `board_id` into `board_groups` → silent failure
   - Migration 00016 referenced `board_id` but never added it

2. **No Idempotent Get-or-Create Logic**
   - Page used `.single()` which throws on 0 rows
   - No fallback to create missing boards
   - Hard crash with "recreate the job" message

3. **Missing RLS Policies**
   - No INSERT policies for authenticated users on `boards` table
   - No INSERT policies for authenticated users on `board_groups` table
   - Board creation during job setup would fail silently due to RLS

4. **Job Creation Partial Failures**
   - Board/group creation in try-catch that didn't fail job creation
   - Jobs created successfully but without boards/groups
   - Users redirected to applicants page → crash

## Solution Implemented

### 1. Database Migration (`00018_add_board_id_to_groups.sql`)

**Part 1: Add board_id to board_groups**
```sql
alter table public.board_groups add column board_id uuid references public.boards(id) on delete cascade;
create index board_groups_board_id_idx on public.board_groups(board_id);
create unique index board_groups_board_name_unique_idx
  on public.board_groups(board_id, name)
  where board_id is not null;
```

**Part 2: Unique constraint on boards(job_id)**
```sql
create unique index boards_job_id_unique_idx on public.boards(job_id)
  where job_id is not null;
```
Enables idempotent upsert with `ON CONFLICT (job_id)`

**Part 3: RLS INSERT policies**
```sql
-- Members can create boards
create policy "Members can insert boards"
  on public.boards
  for insert
  with check (public.is_company_member(company_id));

-- Members can create board groups
create policy "Members can insert board groups"
  on public.board_groups
  for insert
  with check (public.is_company_member(company_id));
```

**Part 4: Migrate existing data**
- Links existing `board_groups` to their boards based on `company_id`
- Best-effort migration for orphaned groups

### 2. Helper Function (`src/lib/boards/getOrCreateApplicantsBoard.ts`)

**Features:**
- ✅ **Idempotent**: Uses `upsert` with `onConflict: "job_id"`
- ✅ **Self-healing**: Creates missing boards and groups automatically
- ✅ **Safe**: Uses `.maybeSingle()` to avoid crashes on 0 rows
- ✅ **Defensive**: Returns structured result with success/error
- ✅ **Observable**: Comprehensive logging at each step

**Flow:**
1. Try to get existing board by `(company_id, job_id, name='Applicants')`
2. If not found → upsert board (handles race conditions)
3. Get groups for board
4. If no groups → upsert default groups (New Applicants, Background Check, Interview, HR Paperwork)
5. Return `{ success: true, board, groups }` or `{ success: false, error, technicalDetails }`

### 3. Updated Applicants Page (`page.tsx`)

**Before:**
```typescript
const { data: board } = await supabase
  .from("boards")
  .select("id")
  .eq("company_id", companyId)
  .eq("job_id", jobId)
  .eq("name", "Applicants")
  .single(); // ❌ Throws on 0 rows

if (!board) throw new Error("Applicants board not found. Please recreate the job.");
```

**After:**
```typescript
const boardResult = await getOrCreateApplicantsBoard(supabase, companyId, jobId);

if (!boardResult.success) {
  return (
    <ErrorPanel
      title="Board Error"
      message={boardResult.error}
      technicalDetails={boardResult.technicalDetails}
      showDetails={process.env.NODE_ENV === 'development'}
    />
  );
}

const { board, groups } = boardResult;
```

**Changes:**
- ✅ Replaced `.single()` with `.maybeSingle()` for all SELECT queries
- ✅ Uses `getOrCreateApplicantsBoard` helper
- ✅ Shows friendly `ErrorPanel` instead of crashing
- ✅ Technical details hidden in production, shown in development
- ✅ No more "recreate the job" message

### 4. Updated Job Creation (`actions.ts`)

**Before:**
```typescript
const { data: board, error: boardErr } = await supabase
  .from("boards")
  .insert({ company_id, job_id, name: "Applicants" })
  .select("id")
  .single();

if (boardErr || !board?.id) {
  console.error("[addJob] Failed to create board:", boardErr);
  throw boardErr || new Error("Board creation failed");
}

// Manual group creation with duplicated code...
```

**After:**
```typescript
const boardResult = await getOrCreateApplicantsBoard(supabase, companyId, job.id);

if (!boardResult.success) {
  console.error("[addJob] Failed to create board:", boardResult.error);
  throw new Error(boardResult.error || "Board creation failed: " + boardResult.technicalDetails);
}

const boardId = boardResult.board.id;
// Groups already created by helper!
```

**Changes:**
- ✅ Uses same `getOrCreateApplicantsBoard` helper
- ✅ Removed duplicate manual group creation code
- ✅ More reliable and consistent with page behavior

## Files Changed

```
supabase/migrations/
└── 00018_add_board_id_to_groups.sql          (NEW) Schema fix + RLS policies

src/lib/boards/
└── getOrCreateApplicantsBoard.ts              (NEW) Idempotent board creation helper

src/app/dashboard/[companyId]/jobs/[jobId]/applicants/
└── page.tsx                                   (MODIFIED) Self-healing, no crashes

src/app/dashboard/[companyId]/jobs/
└── actions.ts                                 (MODIFIED) Uses helper, more reliable
```

## Test Plan

### ✅ Test 1: Create New Job
**Steps:**
1. Navigate to `/dashboard/{companyId}/jobs`
2. Click "Add Job"
3. Fill in job details (title, location, terminal, status)
4. Submit

**Expected:**
- Job created successfully ✅
- Board created with `job_id` set ✅
- 4 default groups created (New Applicants, Background Check, Interview, HR Paperwork) ✅
- Redirected to `/dashboard/{companyId}/jobs/{jobId}/applicants` ✅
- Page loads without errors ✅
- Empty board shows with 4 groups ✅

**Verify in DB:**
```sql
-- Check board was created
SELECT * FROM boards WHERE job_id = '{jobId}';

-- Check groups were created with board_id
SELECT * FROM board_groups WHERE board_id = (SELECT id FROM boards WHERE job_id = '{jobId}');
```

### ✅ Test 2: Navigate to Applicants Page (Board Exists)
**Steps:**
1. Navigate to `/dashboard/{companyId}/jobs/{jobId}/applicants` for existing job with board

**Expected:**
- Page loads normally ✅
- Board and groups displayed ✅
- No errors in console ✅

### ✅ Test 3: Navigate to Applicants Page (Board Missing) - Self-Healing
**Steps:**
1. Delete board for a job:
   ```sql
   DELETE FROM boards WHERE job_id = '{jobId}';
   ```
2. Navigate to `/dashboard/{companyId}/jobs/{jobId}/applicants`

**Expected:**
- Page does NOT crash ✅
- Board is automatically created ✅
- Default groups are created ✅
- Page loads normally with empty board ✅
- Check console logs for:
  ```
  [getOrCreateApplicantsBoard] Board not found, creating...
  [getOrCreateApplicantsBoard] Created new board: {boardId}
  [getOrCreateApplicantsBoard] No groups found, creating defaults...
  [getOrCreateApplicantsBoard] Created 4 groups
  ```

### ✅ Test 4: Navigate to Applicants Page (Groups Missing) - Self-Healing
**Steps:**
1. Delete groups for a board:
   ```sql
   DELETE FROM board_groups WHERE board_id = '{boardId}';
   ```
2. Navigate to `/dashboard/{companyId}/jobs/{jobId}/applicants`

**Expected:**
- Page does NOT crash ✅
- Default groups are automatically created ✅
- Page loads normally ✅

### ✅ Test 5: RLS Permission Check
**Steps:**
1. Ensure user is authenticated and is a member of the company
2. Navigate to applicants page for job without board
3. Check that board is created

**Expected:**
- Board creation succeeds due to new INSERT policy ✅
- Group creation succeeds due to new INSERT policy ✅
- No "permission denied" errors ✅

### ✅ Test 6: Error Handling (RLS Failure)
**Steps:**
1. Simulate RLS failure (e.g., user not a company member)
2. Navigate to applicants page

**Expected:**
- Page shows friendly error panel ✅
- In development: Technical details visible in <details> ✅
- In production: Technical details hidden ✅
- No hard crash with stack trace ✅

### ✅ Test 7: Concurrent Job Creation (Race Condition)
**Steps:**
1. Create job
2. Immediately navigate to applicants page in multiple tabs

**Expected:**
- No duplicate boards created (unique constraint works) ✅
- No duplicate groups created (unique constraint works) ✅
- All tabs show same board ✅

### ✅ Test 8: Existing Jobs Still Work
**Steps:**
1. Navigate to applicants page for jobs created BEFORE migration
2. Ensure old data still loads

**Expected:**
- Old jobs with existing boards work normally ✅
- No errors ✅
- Migration successfully linked old groups to boards ✅

## Migration Rollout

### Step 1: Run Migration
```bash
# Via Supabase CLI
supabase db push

# Or via Supabase Dashboard SQL Editor
# Copy/paste contents of 00018_add_board_id_to_groups.sql
```

### Step 2: Verify Migration
```sql
-- Check board_id column added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'board_groups' AND column_name = 'board_id';

-- Check unique constraints exist
SELECT indexname FROM pg_indexes
WHERE tablename IN ('boards', 'board_groups')
  AND indexname LIKE '%unique%';

-- Check RLS policies
SELECT policyname, cmd
FROM pg_policies
WHERE tablename IN ('boards', 'board_groups')
  AND cmd = 'INSERT';

-- Check existing groups have board_id set
SELECT
  bg.id,
  bg.name,
  bg.board_id IS NOT NULL as has_board_id,
  b.job_id IS NOT NULL as board_has_job
FROM board_groups bg
LEFT JOIN boards b ON b.id = bg.board_id;
```

### Step 3: Deploy Code
```bash
# Push to production
git push origin main
```

### Step 4: Monitor
- Check server logs for `[getOrCreateApplicantsBoard]` messages
- Monitor for any board creation failures
- Verify no crashes reported

## Rollback Plan

If issues occur:

### Option 1: Revert Code Only (Keep Schema)
```bash
git revert HEAD~1
git push origin main
```
Schema changes are safe to keep (board_id column, unique constraints, RLS policies)

### Option 2: Full Rollback (Code + Schema)
```sql
-- Drop new policies
DROP POLICY IF EXISTS "Members can insert boards" ON public.boards;
DROP POLICY IF EXISTS "Members can insert board groups" ON public.board_groups;

-- Drop unique constraints
DROP INDEX IF EXISTS boards_job_id_unique_idx;
DROP INDEX IF EXISTS board_groups_board_name_unique_idx;

-- Remove board_id column
ALTER TABLE public.board_groups DROP COLUMN IF EXISTS board_id;
```

Then revert code:
```bash
git revert HEAD~1
git push origin main
```

---

**Date**: 2026-02-14
**Status**: ✅ Fixed & Tested
**Commits**:
- `b34dd82` Fix applicants dashboard crash with self-healing board creation
