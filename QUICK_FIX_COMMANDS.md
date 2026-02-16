# Quick Fix Commands - Signup Trigger

## TL;DR
The signup trigger was using role='owner' which doesn't exist in `account_memberships` constraint. Fixed to use 'admin' and properly create account → company chain.

---

## 1. Inspect Constraints (Optional - for documentation)

```bash
# Run INSPECT_CONSTRAINTS.sql in Supabase SQL editor
# Shows: account_memberships.role allows ['admin', 'member', 'viewer']
#        company_members.role allows ['owner', 'admin', 'member']
```

---

## 2. Apply Migration Locally

```bash
# Clean reset (recommended - applies all migrations from scratch)
supabase db reset

# Verify migration applied
supabase migration list
# Should show: 00038_fix_signup_trigger.sql ✅
```

---

## 3. Test Signup

```bash
# Start dev server
npm run dev

# Go to signup page and create test account
# Should succeed without "Database error saving new user"
```

---

## 4. Verify Database (Quick Check)

```sql
-- Get latest user
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 1;

-- Check everything was created (replace USER_ID)
SELECT
  am.role as membership_role,
  a.name as account_name,
  c.name as company_name,
  c.account_id as company_has_account_id
FROM account_memberships am
JOIN accounts a ON am.account_id = a.id
JOIN companies c ON c.account_id = a.id
WHERE am.user_id = 'USER_ID'::uuid;

-- Expected:
-- membership_role: admin
-- account_name: test's Company
-- company_name: test's Company
-- company_has_account_id: <uuid> (NOT NULL)
```

---

## 5. Deploy to Staging (After Local Verification)

```bash
# Commit migration
git add supabase/migrations/00038_fix_signup_trigger.sql
git commit -m "Fix signup: use admin role, create account, set account_id"
git push

# Push to staging Supabase
supabase link --project-ref YOUR_STAGING_REF
supabase db push
```

---

## Files Created

1. ✅ `supabase/migrations/00038_fix_signup_trigger.sql` - The fix
2. 📋 `INSPECT_CONSTRAINTS.sql` - Constraint inspection queries
3. 📋 `SIGNUP_FIX_VERIFICATION.md` - Detailed verification guide
4. 📋 `QUICK_FIX_COMMANDS.md` - This file

---

## What Changed in the Trigger

**Before (BROKEN)**:
```sql
-- Created company (no account_id) ❌
INSERT INTO companies (name) VALUES (...);

-- Used 'owner' role (not allowed in account_memberships) ❌
INSERT INTO account_memberships (role) VALUES ('owner');
```

**After (FIXED)**:
```sql
-- 1. Create account first ✅
INSERT INTO accounts (...) RETURNING id INTO new_account_id;

-- 2. Add to account_memberships with 'admin' (valid role) ✅
INSERT INTO account_memberships (account_id, user_id, role)
VALUES (new_account_id, user_id, 'admin');

-- 3. Create company with account_id ✅
INSERT INTO companies (name, account_id)
VALUES (name, new_account_id);

-- 4. Add to company_members with 'owner' (legacy, if table exists) ✅
INSERT INTO company_members (role) VALUES ('owner');
```

---

## Rollback (if needed)

```bash
supabase db reset
# This resets to a clean state with all migrations up to 00037
```
