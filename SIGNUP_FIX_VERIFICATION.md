# Sign-up Fix Verification Guide

## Summary of Changes

### Problem
1. `handle_new_user()` trigger inserted role='owner' into `account_memberships`
2. Constraint only allows: 'admin', 'member', 'viewer' (NO 'owner')
3. Trigger didn't create account or set `companies.account_id` (now NOT NULL)

### Solution (Migration 00038)
1. Create account first
2. Add user to `account_memberships` with role='admin' (valid role)
3. Create company with `account_id` linked
4. Add to `company_members` with 'owner' (if table exists, for legacy)

---

## Step-by-Step Local Verification

### 1. Inspect Current Constraints (Optional)

Run `INSPECT_CONSTRAINTS.sql` in your local Supabase SQL editor to see:
- `account_memberships.role` allows: 'admin', 'member', 'viewer'
- `company_members.role` allows: 'owner', 'admin', 'member'
- `companies.account_id` is NOT NULL

### 2. Apply Migration Locally

```bash
# Option A: Reset DB (cleanest - applies all migrations from scratch)
supabase db reset

# Option B: Apply just this migration (if you want to keep existing data)
supabase migration up
```

### 3. Start Local Dev Server

```bash
npm run dev
# or
pnpm dev
```

### 4. Test Sign-up Flow

1. Navigate to sign-up page (e.g., `http://localhost:3000/signup`)
2. Create a new account with test credentials
3. Expected behavior:
   - ✅ Sign-up succeeds (no "Database error saving new user")
   - ✅ User is redirected to app
   - ✅ User can see their default company

### 5. Verify Database State

Run these SQL queries in Supabase SQL Editor:

```sql
-- A. Get the most recent user
SELECT id, email, created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 1;

-- B. Verify account was created (use user ID from above)
SELECT a.id, a.name, a.plan_type
FROM accounts a
JOIN account_memberships am ON a.id = am.account_id
WHERE am.user_id = 'USER_ID_FROM_STEP_A'::uuid;

-- C. Verify account_memberships with valid role
SELECT am.account_id, am.user_id, am.role
FROM account_memberships am
WHERE am.user_id = 'USER_ID_FROM_STEP_A'::uuid;
-- Expected: role = 'admin' (NOT 'owner')

-- D. Verify company was created with account_id
SELECT c.id, c.name, c.account_id
FROM companies c
WHERE c.account_id IN (
  SELECT account_id FROM account_memberships
  WHERE user_id = 'USER_ID_FROM_STEP_A'::uuid
);
-- Expected: account_id is NOT NULL

-- E. Verify company_members (legacy table, if exists)
SELECT cm.company_id, cm.user_id, cm.role
FROM company_members cm
WHERE cm.user_id = 'USER_ID_FROM_STEP_A'::uuid;
-- Expected: role = 'owner' (this table allows it)
```

### 6. Quick Verification Script

```sql
-- All-in-one verification (replace USER_EMAIL)
WITH latest_user AS (
  SELECT id, email
  FROM auth.users
  WHERE email = 'test@example.com'  -- Replace with your test email
  LIMIT 1
)
SELECT
  'User' as entity,
  lu.email as detail,
  'EXISTS' as status
FROM latest_user lu

UNION ALL

SELECT
  'Account',
  a.name,
  'EXISTS with plan: ' || a.plan_type
FROM latest_user lu
JOIN account_memberships am ON lu.id = am.user_id
JOIN accounts a ON am.account_id = a.id

UNION ALL

SELECT
  'Account Membership',
  'Role: ' || am.role,
  CASE
    WHEN am.role IN ('admin', 'member', 'viewer') THEN 'VALID ✅'
    ELSE 'INVALID ❌'
  END
FROM latest_user lu
JOIN account_memberships am ON lu.id = am.user_id

UNION ALL

SELECT
  'Company',
  c.name,
  CASE
    WHEN c.account_id IS NOT NULL THEN 'Has account_id ✅'
    ELSE 'Missing account_id ❌'
  END
FROM latest_user lu
JOIN account_memberships am ON lu.id = am.user_id
JOIN companies c ON c.account_id = am.account_id;
```

Expected output:
```
entity               | detail                    | status
---------------------|---------------------------|-------------------------
User                 | test@example.com          | EXISTS
Account              | test's Company            | EXISTS with plan: basic
Account Membership   | Role: admin               | VALID ✅
Company              | test's Company            | Has account_id ✅
```

---

## Success Criteria

✅ **Sign-up completes without errors**
✅ **New row in `accounts` table**
✅ **New row in `account_memberships` with role = 'admin'** (NOT 'owner')
✅ **New row in `companies` with `account_id` NOT NULL**
✅ **User can access the app and see their company**
✅ **No "Database error saving new user" message**

---

## If Issues Persist

### Check Supabase Logs

```bash
# View Postgres logs
supabase logs db

# View all logs
supabase logs
```

### Check Trigger Logs

After attempting signup, run:

```sql
-- Enable logging (if not already enabled)
SET client_min_messages TO NOTICE;

-- Then check PostgreSQL logs or try manual trigger test:
SELECT handle_new_user() FROM auth.users LIMIT 1;
```

### Verify Trigger Exists

```sql
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
```

Expected: Should show trigger on `auth.users` table

---

## Rollback (if needed)

If you need to revert:

```bash
# Reset to before migration 00038
supabase db reset
```

Then manually restore data or apply only the migrations you need.

---

## Next Steps: Deploy to Staging

Once local verification passes:

1. **Commit the migration**:
   ```bash
   git add supabase/migrations/00038_fix_signup_trigger.sql
   git commit -m "Fix signup trigger: use admin role, create account, set account_id"
   ```

2. **Deploy to staging**:
   ```bash
   # Push migrations to staging
   supabase db push --project-ref YOUR_STAGING_PROJECT_REF

   # Or via CI/CD pipeline
   git push origin main
   ```

3. **Test on staging**:
   - Perform test signup on staging environment
   - Verify same checks as local

4. **Deploy to production** (after staging verification)
