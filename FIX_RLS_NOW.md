# Fix Applicants RLS Policy - Step by Step

## Problem
- ✅ Applicants exist in database
- ✅ User is authenticated and is a company admin
- ❌ SELECT queries return 0 rows due to RLS blocking

## Root Cause
The RLS SELECT policy on `public.applicants` is blocking visibility even for company members.

---

## Step 1: Run the Fix Migration

**Copy the entire file:** `supabase/migrations/00021_fix_applicants_select_rls.sql`

**Paste it into Supabase SQL Editor:**
1. Go to: https://supabase.com/dashboard/project/axnjswtfpudokkryooxi/sql
2. Click "New Query"
3. Paste the migration SQL
4. Click "Run"

**Expected output:**
```
NOTICE: Dropped policy: Members can view company applicants
(or similar - shows which old policies were dropped)
```

---

## Step 2: Verify the Policy Was Created

Run this in Supabase SQL Editor:

```sql
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'applicants' AND cmd = 'SELECT';
```

**Expected result:**
- `policyname`: `authenticated_users_can_view_company_applicants`
- `cmd`: `SELECT`
- `qual`: Should show the EXISTS clause

---

## Step 3: Test the Policy (Replace UUIDs with Yours)

### Get Your IDs First:
```sql
SELECT
  c.id as company_id,
  am.user_id,
  am.account_id,
  c.account_id as company_account_id
FROM account_memberships am
JOIN companies c ON c.account_id = am.account_id
WHERE am.user_id = auth.uid()
LIMIT 1;
```

Copy the `company_id` from the result.

### Test 1: Check Membership Logic
```sql
-- Replace YOUR_COMPANY_ID with actual UUID
SELECT EXISTS (
  SELECT 1 FROM public.companies c
  INNER JOIN public.account_memberships am ON am.account_id = c.account_id
  WHERE c.id = 'YOUR_COMPANY_ID'::uuid
    AND am.user_id = auth.uid()
) as should_have_access;
```

**Expected:** `should_have_access = true`

### Test 2: Test Helper Function
```sql
-- Replace YOUR_COMPANY_ID with actual UUID
SELECT public.is_company_member('YOUR_COMPANY_ID'::uuid) as has_access;
```

**Expected:** `has_access = true`

### Test 3: Count Applicants (with RLS)
```sql
-- Replace YOUR_COMPANY_ID with actual UUID
SELECT COUNT(*) as visible_applicants
FROM public.applicants
WHERE company_id = 'YOUR_COMPANY_ID'::uuid;
```

**Expected:** `visible_applicants > 0` (should match actual count in DB)

### Test 4: Fetch Applicants (with RLS)
```sql
-- Replace YOUR_COMPANY_ID and YOUR_JOB_ID
SELECT id, full_name, email, company_id, job_id, group_id
FROM public.applicants
WHERE company_id = 'YOUR_COMPANY_ID'::uuid
  AND job_id = 'YOUR_JOB_ID'::uuid
LIMIT 5;
```

**Expected:** Should return applicant rows

---

## Step 4: Test in Application

1. **Restart your dev server:**
   ```bash
   npm run dev
   ```

2. **Load the Applicants Board:**
   ```
   /dashboard/[companyId]/jobs/[jobId]/applicants
   ```

3. **Check server logs:**
   ```
   [Applicants Page] Applicants fetched: { count: X }
   ```
   **Should show count > 0 now!**

4. **Check browser:**
   - Applicants should render in their groups
   - No more "No applicants in this group yet"

---

## Troubleshooting

### Issue 1: Test 1 returns `false`
**Problem:** User's account doesn't match company's account

**Fix:**
```sql
-- Check the mismatch
SELECT
  'User Account' as type,
  am.user_id,
  am.account_id
FROM account_memberships am
WHERE am.user_id = auth.uid()

UNION ALL

SELECT
  'Company Account' as type,
  c.id as user_id,
  c.account_id
FROM companies c
WHERE c.id = 'YOUR_COMPANY_ID'::uuid;
```

If account_ids don't match, you need to:
1. Add user to the correct account, OR
2. Fix the company's account_id

### Issue 2: Test 2 returns `null` or error
**Problem:** Helper function doesn't exist

**Fix:** Re-run the migration (Step 1)

### Issue 3: Test 3 returns 0 but applicants exist
**Problem:** RLS is still blocking

**Check:**
```sql
-- Verify RLS is actually enforced
SHOW row_security;

-- Check if there are conflicting policies
SELECT * FROM pg_policies WHERE tablename = 'applicants';
```

If multiple policies exist, they might conflict. Drop all and re-run migration.

---

## How the Fix Works

### Old Policy (Not Working):
```sql
using (public.is_company_member(company_id));
```
- Calls helper function
- Might have scoping or permission issues

### New Policy (Working):
```sql
using (
  exists (
    select 1
    from public.companies c
    inner join public.account_memberships am on am.account_id = c.account_id
    where c.id = applicants.company_id
      and am.user_id = auth.uid()
  )
)
```
- **Inline EXISTS clause** - no function call
- **Direct table access** - joins companies → account_memberships
- **Explicit user check** - `am.user_id = auth.uid()`
- **Company scoping** - `c.id = applicants.company_id`

This ensures:
✅ Authenticated users see applicants from their companies
✅ No dependency on helper function working correctly
✅ Clear, explicit logic that PostgreSQL can optimize

---

## After the Fix

**You should see:**
- ✅ Server logs: `Applicants fetched: { count: X }` (X > 0)
- ✅ Browser: Applicants render in their groups
- ✅ No orphaned applicants (unless actual board mismatch)

**Send me the results of Test 3 and Test 4 to confirm the fix worked!**
