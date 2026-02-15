# Quick Fix Guide - Applicants Not Showing

## What's Been Fixed

### 1. **Code Fix**: Fixed createGroup UUID error
- **Problem**: `createGroup` was being called with wrong parameters, causing "invalid input syntax for type uuid: 'Hired'" error
- **Solution**: Added missing `jobId` parameter to the function call
- **File**: `src/app/dashboard/[companyId]/jobs/[jobId]/applicants/ApplicantsBoard.tsx`

### 2. **Database Fix**: Fixed RLS policies for all board tables
- **Problem**: All board-related tables (boards, board_groups, board_columns, etc.) had RLS policies using the old `company_members` table instead of the new `account_memberships` system
- **Solution**: Created comprehensive migration that updates all RLS policies and ensures helper functions exist
- **File**: `supabase/migrations/00020_fix_board_rls.sql`

## Apply the Fix RIGHT NOW

### Step 1: Run the Migration

**Option A: Copy SQL to Supabase SQL Editor (EASIEST)**

1. Copy the entire file: `supabase/migrations/00020_fix_board_rls.sql`
2. Go to: https://supabase.com/dashboard/project/axnjswtfpudokkryooxi/sql
3. Click "New Query"
4. Paste the SQL
5. Click "Run"

**Option B: Use the helper script**

```bash
chmod +x apply-board-rls-fix.sh
./apply-board-rls-fix.sh
```

Choose option 1 to copy to clipboard, then paste in Supabase SQL Editor.

### Step 2: Deploy Code Changes

The code fix (createGroup parameter fix) has already been applied to the codebase. If you're running locally, just restart your dev server. If you're on production, deploy the latest changes.

```bash
# If running locally, restart:
npm run dev

# If on Vercel or similar, push to git:
git add .
git commit -m "Fix applicants board RLS and createGroup UUID error"
git push
```

### Step 3: Verify the Fix

1. **Test the migration worked**:
   ```sql
   -- Run in Supabase SQL Editor
   SELECT tablename, policyname, cmd
   FROM pg_policies
   WHERE schemaname = 'public'
   AND tablename IN ('boards', 'board_groups', 'board_columns', 'board_cells')
   ORDER BY tablename, policyname;
   ```

   You should see policies like "Members can view company boards", "Members can insert board groups", etc.

2. **Test applicants showing**:
   - Go to your dashboard Applicants Board
   - The existing 2 applicants should now be visible
   - Submit a new application via the public form
   - The new applicant should appear immediately in "New Applicants"

3. **Test createGroup**:
   - In the Applicants Board, try creating a new group (e.g., "Hired")
   - It should create successfully without UUID errors

## What This Migration Does

The migration is **100% idempotent** - you can run it multiple times safely. It:

1. ✅ Creates or replaces `is_company_member()` and `is_company_admin()` helper functions
2. ✅ Drops ALL existing RLS policies for board tables (handles old policy names)
3. ✅ Creates new RLS policies using the correct `account_memberships` system
4. ✅ Sets up proper permissions for:
   - `boards` - SELECT, INSERT, UPDATE for members; DELETE for admins
   - `board_groups` - SELECT, INSERT, UPDATE for members; DELETE for admins
   - `board_columns` - SELECT, INSERT, UPDATE for members; DELETE for admins
   - `board_status_labels` - All operations for members (via board_columns join)
   - `board_cells` - All operations for members (via applicants join)

## Root Causes Identified

### Issue 1: RLS Policy Mismatch
- **Root Cause**: All board-related tables were using old `company_members` table for RLS
- **Impact**: Dashboard users couldn't fetch boards, groups, columns, or cells
- **Result**: UI showed "0 applicants" even though data existed in DB
- **Fix**: Updated all policies to use `is_company_member()` helper with `account_memberships`

### Issue 2: createGroup Parameter Mismatch
- **Root Cause**: Function signature is `createGroup(companyId, jobId, boardId, name, color?)` but was being called as `createGroup(companyId, boardId, name)`
- **Impact**: Group name like "Hired" was passed as `boardId` parameter, causing UUID parsing error
- **Result**: Creating new groups always failed with "invalid input syntax for type uuid"
- **Fix**: Added missing `jobId` parameter to function call

## Expected Behavior After Fix

✅ Applicants appear immediately in dashboard after public form submission
✅ Group counts show correct numbers (e.g., "New Applicants (2)")
✅ All board columns and cells are visible
✅ Creating new groups works without errors
✅ No manual page refresh required

## Still Having Issues?

If applicants still don't show after applying the migration:

1. Check that the helper functions exist:
   ```sql
   SELECT proname FROM pg_proc WHERE proname IN ('is_company_member', 'is_company_admin');
   ```

2. Verify your account membership:
   ```sql
   SELECT am.*, c.id as company_id, c.name as company_name
   FROM account_memberships am
   JOIN companies c ON c.account_id = am.account_id
   WHERE am.user_id = auth.uid();
   ```

3. Check the application server logs for detailed error messages

4. Review the comprehensive documentation in `BOARD_RLS_FIX.md`
