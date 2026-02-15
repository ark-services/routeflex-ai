# Board RLS Fix - Applicants Not Showing in Dashboard

## Problem
Job applications are saved successfully, applicants exist in the database and are correctly linked to board + group, but the dashboard Applicants Board UI shows 0 applicants.

## Root Cause
All board-related tables (`boards`, `board_groups`, `board_columns`, `board_status_labels`, `board_cells`) had RLS policies using the OLD `company_members` table pattern, while the `applicants` table was correctly updated to use the new `is_company_member` helper function.

When dashboard users try to fetch data:
1. The `applicants` query works fine (uses new RLS policy)
2. But queries to `boards`, `board_groups`, `board_columns`, and `board_cells` fail RLS checks
3. This causes `getOrCreateApplicantsBoard` and other board queries to return empty results
4. UI shows "New Applicants (0)" even though data exists

## Solution
Created migration `00020_fix_board_rls.sql` that updates ALL board-related RLS policies to use the `is_company_member` and `is_company_admin` helper functions (which use `account_memberships` instead of `company_members`).

## How to Apply the Fix

### Option 1: Using Supabase SQL Editor (Recommended)
1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/axnjswtfpudokkryooxi/sql
2. Click "New Query"
3. Copy and paste the entire contents of `supabase/migrations/00020_fix_board_rls.sql`
4. Click "Run"

### Option 2: Using Supabase CLI
```bash
# First, login to Supabase CLI
npx supabase login

# Link your project
npx supabase link --project-ref axnjswtfpudokkryooxi

# Push the migration
npx supabase db push
```

## What the Migration Does

### 1. Updates `boards` table RLS policies
- ✅ SELECT: Uses `is_company_member(company_id)`
- ✅ INSERT: Uses `is_company_member(company_id)`
- ✅ UPDATE: Uses `is_company_member(company_id)`
- ✅ DELETE: Uses `is_company_admin(company_id)`

### 2. Updates `board_groups` table RLS policies
- ✅ SELECT: Uses `is_company_member(company_id)`
- ✅ INSERT: Uses `is_company_member(company_id)`
- ✅ UPDATE: Uses `is_company_member(company_id)`
- ✅ DELETE: Uses `is_company_admin(company_id)`

### 3. Updates `board_columns` table RLS policies
- ✅ SELECT: Uses `is_company_member(company_id)`
- ✅ INSERT: Uses `is_company_member(company_id)`
- ✅ UPDATE: Uses `is_company_member(company_id)`
- ✅ DELETE: Uses `is_company_admin(company_id)`

### 4. Updates `board_status_labels` table RLS policies
- ✅ SELECT: Uses `is_company_member` via join with `board_columns`
- ✅ INSERT: Uses `is_company_member` via join with `board_columns`
- ✅ UPDATE: Uses `is_company_member` via join with `board_columns`
- ✅ DELETE: Uses `is_company_admin` via join with `board_columns`

### 5. Updates `board_cells` table RLS policies
- ✅ SELECT: Uses `is_company_member` via join with `applicants`
- ✅ INSERT: Uses `is_company_member` via join with `applicants`
- ✅ UPDATE: Uses `is_company_member` via join with `applicants`
- ✅ DELETE: Uses `is_company_admin` via join with `applicants`

## Verification

After applying the migration, verify the fix:

1. **Check that the migration was applied successfully:**
   ```sql
   -- In Supabase SQL Editor, run:
   SELECT * FROM pg_policies
   WHERE schemaname = 'public'
   AND tablename IN ('boards', 'board_groups', 'board_columns', 'board_status_labels', 'board_cells')
   ORDER BY tablename, policyname;
   ```

2. **Test that board queries work:**
   ```sql
   -- Should return board data (if you're logged in as a company member)
   SELECT * FROM boards WHERE company_id = '<your-company-id>' LIMIT 5;
   SELECT * FROM board_groups WHERE company_id = '<your-company-id>' LIMIT 5;
   ```

3. **Test the dashboard:**
   - Submit a new application via the public apply form
   - Go to the Applicants Board in the dashboard
   - Verify that the applicant appears immediately in "New Applicants"
   - Count should show "New Applicants (1)" instead of "(0)"

## Files Changed

### New Files
- ✅ `supabase/migrations/00020_fix_board_rls.sql` - Comprehensive RLS fix for all board tables
- ✅ `BOARD_RLS_FIX.md` - This documentation file

### No Code Changes Required
The application code does NOT need any changes. The issue was purely at the database RLS policy level.

## Expected Behavior After Fix

✅ Public application submissions create applicants in the database
✅ Dashboard users can immediately see new applicants in the Applicants Board
✅ Group counts show correct numbers (e.g., "New Applicants (3)")
✅ All board columns and cells are visible
✅ No manual page refresh required

## Troubleshooting

If applicants still don't show after applying the migration:

1. **Verify the helper functions exist:**
   ```sql
   SELECT proname, prosrc
   FROM pg_proc
   WHERE proname IN ('is_company_member', 'is_company_admin');
   ```

   If they don't exist, run migration `00017_fix_form_engine_rls.sql` first.

2. **Check RLS is enabled:**
   ```sql
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public'
   AND tablename IN ('boards', 'board_groups', 'board_columns', 'board_status_labels', 'board_cells');
   ```

   All should show `rowsecurity = true`.

3. **Verify account membership:**
   ```sql
   -- Replace with your user_id and company_id
   SELECT * FROM account_memberships am
   JOIN companies c ON c.account_id = am.account_id
   WHERE am.user_id = auth.uid()
   AND c.id = '<your-company-id>';
   ```

   Should return a row confirming membership.

4. **Check server logs:**
   - Look in the application server logs for errors from `getOrCreateApplicantsBoard`
   - Check the console logs in page.tsx (lines 106-249) for detailed query results

## Related Migrations

This fix completes the RLS migration to the new account_memberships system:

- ✅ `00011_accounts.sql` - Created accounts and account_memberships tables
- ✅ `00017_fix_form_engine_rls.sql` - Created is_company_member/is_company_admin helpers + fixed form RLS
- ✅ `00019_fix_applicants_rls.sql` - Fixed applicants table RLS
- ✅ `00020_fix_board_rls.sql` - Fixed all board-related table RLS (THIS FIX)

## Summary

**This migration fixes the "0 applicants showing in dashboard" bug by updating all board-related RLS policies to use the correct account_memberships-based helper functions instead of the deprecated company_members table.**

No application code changes are needed - just run the migration!
