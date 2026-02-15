# Metering Fix - Ambiguity Error Resolution

## Issue Encountered
```
ERROR: column reference "period_start" is ambiguous
DETAIL: It could refer to either a PL/pgSQL variable or a table column.
```

## Root Cause
In `get_or_create_action_period`, the function returns a column named `period_start`, and the table `account_action_periods` also has a column named `period_start`. When querying without table aliases, Postgres couldn't determine which `period_start` was being referenced.

**Problematic code:**
```sql
select exists(
  select 1 from public.account_action_periods
  where account_id = p_account_id and period_start = v_period_start
) into period_exists;
```

## Solution
Created migration `00035_fix_period_start_ambiguity.sql` that:

1. **Added table aliases everywhere:**
   - `account_action_periods` → `aap`
   - `get_billing_period(...)` → `bp`

2. **Qualified all column references:**
   - `period_start` → `aap.period_start`
   - `account_id` → `aap.account_id`

3. **Renamed variable to avoid confusion:**
   - `period_exists` → `v_period_exists`

**Fixed code:**
```sql
select exists(
  select 1
  from public.account_action_periods aap
  where aap.account_id = p_account_id
    and aap.period_start = v_period_start
) into v_period_exists;
```

## What Changed

### Migration 00035 (supersedes 00034)
- ✅ Fixed `get_or_create_action_period` with proper table aliases
- ✅ Fixed `record_action_usage` with proper table aliases
- ✅ All column references now fully qualified
- ✅ Retained all logging enhancements

## Deployment Steps

**Option 1: If 00034 was not applied yet**
```bash
# Skip 00034, apply 00035 directly
# 00035 includes all fixes from 00034 plus the ambiguity fix
```

**Option 2: If 00034 was already applied**
```bash
# Apply 00035 on top of it
# 00035 replaces the functions with fixed versions
```

Both options work because we're using `CREATE OR REPLACE FUNCTION`.

## Testing

After applying migration:

```bash
# 1. Trigger an automation
# 2. Should NOT see ambiguity error
# 3. Should see success logs:
[fireJobTrigger] ✓✓✓ SUCCESS! Metering RPC completed
[fireJobTrigger] Ledger ID returned: <uuid>
```

## Verification

```sql
-- Test the RPC directly
SELECT record_action_usage(
  'your-account-id'::uuid,
  1, 'test', null, null, null, null, null, 'completed', '{}'::jsonb
);

-- Should return a UUID without error
```

---

**Status: Ready to apply migration 00035** ✅
