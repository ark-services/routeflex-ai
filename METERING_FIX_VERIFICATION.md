# Metering Fix Verification Guide

## Summary of Changes

### Problem
- **Admin Center showed "Actions Used = 0"** even though automations were running
- **RLS blocked period creation** with error: `query would be affected by row-level security policy for table "account_action_periods"`
- **Root cause**: `get_or_create_action_period` was NOT `SECURITY DEFINER`, so it ran as authenticated user and RLS blocked INSERT operations

### Solution Applied
1. ✅ Made `get_or_create_action_period` **SECURITY DEFINER** (migration 00036)
2. ✅ Made `get_billing_period` **SECURITY DEFINER** for consistency
3. ✅ Added `set search_path = public` to all functions for security
4. ✅ Granted EXECUTE permissions to authenticated role
5. ✅ Fixed Admin Center to throw errors instead of showing fake "used: 0" data
6. ✅ Billing periods are monthly (already implemented in 00034), anchored to `billing_anchor_day`

## Verification Steps

### 1. Apply the Migration

```bash
# Deploy to Supabase
supabase db push

# Or apply manually via Supabase Dashboard SQL editor
# Copy contents of: supabase/migrations/00036_fix_metering_rls_and_security.sql
```

### 2. Verify Function Security Settings

Run this SQL to confirm SECURITY DEFINER is set:

```sql
SELECT
  routine_name,
  security_type,
  routine_definition LIKE '%security definer%' as has_security_definer
FROM information_schema.routines
WHERE routine_name IN ('get_or_create_action_period', 'record_action_usage', 'get_billing_period')
  AND routine_schema = 'public';
```

Expected output:
```
routine_name                    | security_type | has_security_definer
--------------------------------|---------------|---------------------
get_billing_period             | DEFINER       | true
get_or_create_action_period    | DEFINER       | true
record_action_usage            | DEFINER       | true
```

### 3. Verify Billing Period for Your Account

```sql
-- Replace YOUR_ACCOUNT_ID with your actual account UUID
SELECT * FROM get_billing_period('YOUR_ACCOUNT_ID'::uuid, now());
```

Expected output (monthly period):
```
period_start            | period_end
-----------------------|------------------------
2026-02-17 20:39:38+00 | 2026-03-17 20:39:38+00  (example - your dates will vary)
```

**Important**: `period_end - period_start` should be approximately **1 month** (not 1 year).

### 4. Verify Period Row Can Be Created

```sql
-- Replace YOUR_ACCOUNT_ID with your actual account UUID
SELECT * FROM get_or_create_action_period('YOUR_ACCOUNT_ID'::uuid, now());
```

Expected output:
```
period_start            | period_end             | quota_units | used_units | locked_editing | paused_execution | carryover_debt_units
-----------------------|------------------------|-------------|------------|----------------|------------------|---------------------
2026-02-17 20:39:38+00 | 2026-03-17 20:39:38+00 | 3000        | 0 or more  | false          | false            | 0
```

**Key checks**:
- ✅ No RLS error
- ✅ Returns a row
- ✅ `used_units` should reflect actual automation runs (may be 0 if no automations have run yet)

### 5. Verify Period Row Exists in Table

```sql
-- Replace YOUR_ACCOUNT_ID with your actual account UUID
SELECT
  account_id,
  period_start,
  period_end,
  quota_units,
  used_units,
  updated_at
FROM account_action_periods
WHERE account_id = 'YOUR_ACCOUNT_ID'::uuid
ORDER BY period_start DESC
LIMIT 5;
```

Expected: At least one row for the current period.

### 6. Verify Ledger Entries Exist

```sql
-- Replace YOUR_ACCOUNT_ID with your actual account UUID
SELECT
  id,
  occurred_at,
  units,
  source,
  status,
  metadata->>'automation_name' as automation_name,
  metadata->>'action_type' as action_type
FROM account_action_ledger
WHERE account_id = 'YOUR_ACCOUNT_ID'::uuid
ORDER BY occurred_at DESC
LIMIT 10;
```

Expected: One row per successful automation action execution.

### 7. Verify Admin Center Shows Correct Data

1. Navigate to: `/admin/YOUR_ACCOUNT_ID`
2. Check the **"Actions Used"** card
3. Expected behavior:
   - ✅ Shows real count (not 0 if automations have run)
   - ✅ Shows "of 3,000" (or 10,000 for Pro)
   - ✅ "Resets on" date is ~1 month out (not 1 year)
   - ✅ Period dates shown at bottom match SQL query results

**Before Fix**:
```
Actions Used: 0  ← Always showed 0
of 3,000
```

**After Fix**:
```
Actions Used: 5  ← Shows real count
of 3,000
```

### 8. Trigger an Automation and Verify Metering

1. **Create a test automation** (or use existing one)
2. **Trigger it** by changing a status that matches the automation filter
3. **Check server logs** for metering output:

```
[fireJobTrigger] 💰 Starting metering for successful action...
[fireJobTrigger] Found account_id: xxx
[fireJobTrigger] Calling record_action_usage RPC...
[record_action_usage] ========================================
[record_action_usage] Called with account_id: xxx, units: 1, source: automation
[record_action_usage] Billing period: 2026-02-17 to 2026-03-17
[record_action_usage] ✓ Ledger row created: yyy
[record_action_usage] ✓ Period updated, rows affected: 1
[record_action_usage] ✓ Complete, returning ledger_id: yyy
[fireJobTrigger] ✓✓✓ SUCCESS! Metering RPC completed
```

4. **Refresh Admin Center** - "Actions Used" should increment by 1

### 9. Verify Monthly Reset Logic

```sql
-- Check billing anchor day for your account
SELECT id, billing_anchor_day, created_at
FROM accounts
WHERE id = 'YOUR_ACCOUNT_ID'::uuid;
```

Expected:
- `billing_anchor_day` should be between 1-28 (day of month)
- If NULL, the backfill from migration 00034 should have set it to the day of `created_at`

**Monthly reset formula**:
- If today is February 17, 2026
- And `billing_anchor_day = 17`
- Then current period is: Feb 17, 2026 → Mar 17, 2026
- Next period starts: Mar 17, 2026 → Apr 17, 2026

### 10. Test Admin Center Error Handling (Optional)

To verify proper error handling, temporarily break something:

```sql
-- Temporarily revoke EXECUTE (don't leave this broken!)
REVOKE EXECUTE ON FUNCTION get_or_create_action_period FROM authenticated;
```

Then:
1. Navigate to Admin Center
2. Expected: Page throws error with details (not fake "used: 0" data)
3. **IMPORTANT**: Restore permissions:

```sql
GRANT EXECUTE ON FUNCTION get_or_create_action_period TO authenticated;
```

## Common Issues & Troubleshooting

### Issue: Still seeing RLS errors

**Diagnosis**:
```sql
-- Check if functions are SECURITY DEFINER
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_name = 'get_or_create_action_period';
```

**Fix**: Re-run migration 00036

### Issue: used_units not incrementing

**Diagnosis**:
```sql
-- Check recent ledger entries
SELECT * FROM account_action_ledger
WHERE account_id = 'YOUR_ACCOUNT_ID'::uuid
ORDER BY occurred_at DESC LIMIT 5;

-- Check if period row exists
SELECT * FROM account_action_periods
WHERE account_id = 'YOUR_ACCOUNT_ID'::uuid;
```

**Possible causes**:
1. Automations not actually running (check `automation_runs` table)
2. Metering RPC failing silently (check server logs)
3. Status is not 'completed' (only completed actions count)

### Issue: Period reset date is 1 year out (not 1 month)

**Diagnosis**:
```sql
SELECT * FROM get_billing_period('YOUR_ACCOUNT_ID'::uuid, now());
```

**Fix**: This should be fixed by migration 00034 and 00036. If still wrong, check:
```sql
-- Verify get_billing_period uses interval '1 month'
SELECT routine_definition
FROM information_schema.routines
WHERE routine_name = 'get_billing_period';
```

Should contain: `v_end := v_start + interval '1 month';`

### Issue: Admin Center shows error after migration

**Expected behavior**: If migration 00036 is applied correctly, this should NOT happen.

**If it does happen**:
1. Check Supabase logs for the RPC error
2. Verify migration was applied: `SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;`
3. Check function grants: `SELECT * FROM information_schema.routine_privileges WHERE routine_name = 'get_or_create_action_period';`

## Success Criteria

✅ **Admin Center loads without errors**
✅ **"Actions Used" shows real count (matches ledger entries)**
✅ **"Resets on" date is ~1 month out (not 1 year)**
✅ **After triggering automation, used count increments**
✅ **Server logs show "✓✓✓ SUCCESS! Metering RPC completed"**
✅ **No RLS errors in logs**
✅ **Period row exists in `account_action_periods` table**
✅ **Ledger rows exist in `account_action_ledger` table**

## Architecture Notes

### Security Model

**Before Fix**:
- Functions ran as authenticated user
- RLS blocked INSERT into `account_action_periods`
- Admin Center couldn't create/read periods

**After Fix**:
- Functions run as table owner (postgres) via `SECURITY DEFINER`
- Functions bypass RLS for writes
- Users can still only SELECT their own data (RLS still enforced for direct queries)
- App-level security enforced in functions (account_id matching)

### Billing Period Logic

- **Monthly billing** anchored to `accounts.billing_anchor_day` (1-28)
- Period length: Always 1 month
- Example: If anchor day = 17, periods are: Feb 17-Mar 17, Mar 17-Apr 17, etc.
- Special case: Accounts created mid-month start from `created_at`, not anchor day

### Metering Write Path

1. Automation action executes successfully
2. `fireJobTrigger` → calls `record_action_usage` RPC
3. `record_action_usage` (SECURITY DEFINER):
   - Inserts row into `account_action_ledger` (audit trail)
   - Increments `account_action_periods.used_units` (quota tracking)
   - Runs atomically in transaction

### Admin Center Read Path

1. Admin Center → calls `get_or_create_action_period` RPC
2. `get_or_create_action_period` (SECURITY DEFINER):
   - Calls `get_billing_period` to find current monthly period
   - Creates period row if missing (INSERT)
   - Returns current quota/used/remaining
3. Admin Center displays real data (no fallback)
