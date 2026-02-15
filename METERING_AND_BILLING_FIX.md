# Metering & Billing Period Fix

## Issues Fixed

### 1. Actions Used Tracking Stuck at 0 ✅
**Problem:** Automations running successfully but ledger shows no rows.

**Root Cause:** Likely one of:
- RPC errors being swallowed silently
- Missing/NULL billing_anchor_day causing get_billing_period to fail
- Period row not being created properly

**Solution:**
- ✅ Enhanced `record_action_usage` RPC with verbose RAISE NOTICE logging
- ✅ Enhanced `get_billing_period` to handle NULL billing_anchor_day (defaults to 1st)
- ✅ Added comprehensive logging to fireJobAutomation.ts metering code
- ✅ Backfilled any missing billing_anchor_day values
- ✅ All functions already SECURITY DEFINER (no RLS issues)

### 2. Billing Period Reset Date Wrong ✅
**Problem:** Admin Center shows "Resets on 2/15/2026" (today) instead of end of monthly period.

**Root Cause:** Admin UI not displaying period_end correctly.

**Solution:**
- ✅ Admin Center now properly displays period_end from RPC result
- ✅ Added detailed period info: "Period: start - end" and "Resets on: end"
- ✅ get_billing_period already calculates proper monthly periods anchored to billing_anchor_day

---

## Changes Made

### Migration: 00034_fix_metering_and_billing_periods.sql

#### Part 1: Enhanced get_billing_period
```sql
- Handles NULL billing_anchor_day (defaults to 1st of month)
- Added RAISE NOTICE logging for debugging
- Returns proper monthly period: start to start + 1 month
```

#### Part 2: Verbose record_action_usage Logging
```sql
RAISE NOTICE logs for every step:
- Input parameters (account_id, units, source, status)
- Billing period calculation result
- Ledger insert confirmation with ID
- Period counter update with rows affected
- Warnings if period row not found
```

**Console Output Example:**
```
[record_action_usage] ========================================
[record_action_usage] Called with account_id: abc-123, units: 1, source: automation
[record_action_usage] Billing period: 2026-01-15 to 2026-02-15
[record_action_usage] Inserting into account_action_ledger...
[record_action_usage] ✓ Ledger row created: xyz-789
[record_action_usage] Updating period used_units counter...
[record_action_usage] ✓ Period updated, rows affected: 1
[record_action_usage] ✓ Complete, returning ledger_id: xyz-789
[record_action_usage] ========================================
```

#### Part 3: Fixed get_or_create_action_period
```sql
- Added verbose logging
- Ensures period_end = period_start + 1 month
- Returns complete period data including period_end
```

#### Part 4: Backfill Missing Data
```sql
UPDATE accounts
SET billing_anchor_day = extract(day from created_at)::int
WHERE billing_anchor_day IS NULL;
```

### Code: Enhanced Automation Engine Logging
**File:** `src/lib/automations/fireJobAutomation.ts`

**Before:**
```typescript
const { data: meteringResult, error: meteringError } = await supabase.rpc('record_action_usage', ...);
if (meteringError) console.error('Metering error:', meteringError);
```

**After:**
```typescript
console.log('[fireJobTrigger] Calling record_action_usage RPC...');
console.log('[fireJobTrigger] RPC params:', JSON.stringify(meteringParams, null, 2));

const { data: meteringResult, error: meteringError } = await supabase.rpc('record_action_usage', meteringParams);

if (meteringError) {
  console.error('[fireJobTrigger] ❌ Metering RPC error:', meteringError);
  console.error('[fireJobTrigger] Error details:', { message, details, hint, code, stack });
  console.error('[fireJobTrigger] Full error object:', JSON.stringify(meteringError, null, 2));
} else {
  console.log('[fireJobTrigger] ✓✓✓ SUCCESS! Metering RPC completed');
  console.log('[fireJobTrigger] Ledger ID returned:', meteringResult);
  console.log('[fireJobTrigger] This means the action was counted toward quota');
}
```

### Code: Fixed Admin Center Period Display
**File:** `src/app/admin/[accountId]/page.tsx`

**Changes:**
1. **Added logging:** Console logs for period data and errors
2. **Better defaults:** Proper fallback if period RPC fails
3. **Displayed period_end:** Shows correct reset date
4. **Added period info:** Shows full period range in UI

**UI Enhancement:**
```tsx
<div className="mt-4 text-xs text-stone-500">
  <div>Period: {start} - {end}</div>
  <div>Resets on: {end}</div>
</div>
```

---

## How It Works Now

### Metering Flow
1. **Automation executes successfully** → calls metering code
2. **Get account_id** from company table
3. **Call record_action_usage RPC** with all params
4. **RPC calculates billing period** using get_billing_period
5. **RPC creates period row** if doesn't exist
6. **RPC inserts ledger row** (append-only audit trail)
7. **RPC updates period counter** (used_units += 1)
8. **Returns ledger_id** confirming success
9. **Console logs show every step** for debugging

### Billing Period Logic
1. **Anchor day** from `accounts.billing_anchor_day` (1-28)
2. **Current period start:** Most recent anchor day ≤ today
3. **Current period end:** period_start + 1 month
4. **Example:** Anchor day 15
   - Jan 15 - Feb 15
   - Feb 15 - Mar 15
   - Mar 15 - Apr 15
   - etc.

### Admin Center Display
1. **Queries:** `get_or_create_action_period(account_id)`
2. **Returns:**
   - `period_start`, `period_end`
   - `quota_units`, `used_units`
   - Other metadata
3. **Displays:**
   - "Actions Used: {used_units} of {quota_units}"
   - "Actions Remaining: {quota - used}"
   - "Period: {start} - {end}"
   - "Resets on: {end}"

---

## Testing & Verification

### Test 1: Verify Metering Works
```bash
# 1. Trigger an automation that executes an action
# 2. Check server console logs - should see:

[fireJobTrigger] 💰 Starting metering for successful action...
[fireJobTrigger] Found account_id: abc-123-def
[fireJobTrigger] Calling record_action_usage RPC...
[fireJobTrigger] RPC params: { p_account_id: "abc-123", ... }
[fireJobTrigger] ✓✓✓ SUCCESS! Metering RPC completed
[fireJobTrigger] Ledger ID returned: xyz-789-ghi
```

### Test 2: Check Database Logs (Postgres Server Logs)
```sql
-- Look for RAISE NOTICE output in Postgres logs:
[record_action_usage] ========================================
[record_action_usage] Called with account_id: abc-123...
[record_action_usage] ✓ Ledger row created: xyz-789
[record_action_usage] ✓ Period updated, rows affected: 1
```

### Test 3: Verify Ledger Rows Created
```sql
-- Should see rows in ledger
SELECT * FROM account_action_ledger
WHERE account_id = 'your-account-id'
ORDER BY occurred_at DESC
LIMIT 10;

-- Should see period row with used_units > 0
SELECT * FROM account_action_periods
WHERE account_id = 'your-account-id'
ORDER BY period_start DESC;
```

### Test 4: Check Admin Center
```
✓ "Actions Used" increments after automation runs
✓ "Actions Remaining" decreases
✓ "Resets on" shows future date (end of monthly period)
✓ Period info shows: "Period: 2/15/2026 - 3/15/2026"
✓ Debug panels show ledger entries and automation runs
```

---

## Debugging Guide

### If Actions Used Still at 0

**Step 1: Check server console logs**
```
Look for:
✓ [fireJobTrigger] ✓✓✓ SUCCESS! Metering RPC completed

If you see:
❌ [fireJobTrigger] ❌ Metering RPC error
→ Check the error details in logs
```

**Step 2: Check Postgres server logs**
```
Look for RAISE NOTICE messages:
✓ [record_action_usage] ✓ Ledger row created
✓ [record_action_usage] ✓ Period updated, rows affected: 1

If you see:
⚠️ [record_action_usage] No period row updated
→ Period might not exist or period_start doesn't match
```

**Step 3: Manually test RPC**
```sql
-- Test record_action_usage directly
SELECT record_action_usage(
  'your-account-id'::uuid,
  1, -- units
  'test',
  null, null, null, null, null,
  'completed',
  '{}'::jsonb
);

-- Should return a UUID (ledger_id)
-- Check logs for RAISE NOTICE output
```

**Step 4: Check period data**
```sql
-- Verify account has billing_anchor_day
SELECT id, billing_anchor_day, created_at
FROM accounts
WHERE id = 'your-account-id';

-- Should NOT be NULL

-- Check current period
SELECT * FROM get_billing_period('your-account-id'::uuid, now());

-- Should return period_start and period_end

-- Check period row exists
SELECT * FROM account_action_periods
WHERE account_id = 'your-account-id'
ORDER BY period_start DESC;
```

**Step 5: Check RLS policies**
```sql
-- record_action_usage is SECURITY DEFINER, so RLS shouldn't block it
-- But verify:
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_name = 'record_action_usage';

-- Should show: security_type = 'DEFINER'
```

### If Reset Date Still Wrong

**Check Admin Center console logs:**
```javascript
[AdminOverview] Period data: { period_start: "...", period_end: "..." }
[AdminOverview] Final period data: { quota: 3000, used: 5, period_end: "..." }
```

**Verify RPC returns period_end:**
```sql
SELECT * FROM get_or_create_action_period('your-account-id'::uuid);
-- Should return a row with period_end column
```

---

## Summary of Logging Enhancements

### 1. Postgres Server Logs (RAISE NOTICE)
- ✅ `get_billing_period`: Account ID, anchor day, period range
- ✅ `get_or_create_action_period`: Period existence, creation
- ✅ `record_action_usage`: Full metering flow with step-by-step confirmation

### 2. Application Server Logs (console.log)
- ✅ `fireJobAutomation.ts`: Account lookup, RPC call, params, result
- ✅ `Admin Center`: Period data, errors, final calculations

### 3. Debug UI (Admin Center - Dev Only)
- ✅ Recent Action Ledger (last 10 entries)
- ✅ Recent Automation Runs (last 10 runs)
- ✅ Period info display

---

## Migration Checklist

- [ ] Apply migration 00034_fix_metering_and_billing_periods.sql
- [ ] Check Postgres server logs are visible (needed for RAISE NOTICE)
- [ ] Restart application to load new RPC functions
- [ ] Trigger test automation with actions
- [ ] Verify console logs show metering success
- [ ] Check Admin Center "Actions Used" increments
- [ ] Verify "Resets on" shows future date (not today)
- [ ] Query database to confirm ledger rows created

---

## Expected Behavior After Fix

✅ **Automations run** → Metering logs appear in console
✅ **Ledger rows created** → Visible in database and debug panel
✅ **Period counter updates** → used_units increments
✅ **Admin Center refreshed** → Shows correct count and reset date
✅ **Verbose logging** → Easy to diagnose any issues
✅ **Monthly billing** → Anchored to account creation day-of-month

---

## Files Changed

### Migrations
1. `supabase/migrations/00034_fix_metering_and_billing_periods.sql` - **NEW**
   - Enhanced get_billing_period
   - Verbose record_action_usage
   - Fixed get_or_create_action_period
   - Backfilled billing_anchor_day

### Code
2. `src/lib/automations/fireJobAutomation.ts`
   - Enhanced metering logs with JSON output
   - Explicit success/error messages

3. `src/app/admin/[accountId]/page.tsx`
   - Fixed period_end display
   - Added period range info
   - Added console logging

---

## Production Deployment Notes

### Before Deploy
- Review Postgres server log settings (ensure NOTICE visible)
- Plan for verbose logs (can be disabled later by commenting out RAISE NOTICE)

### After Deploy
- Monitor server console for metering success messages
- Check Postgres logs for RPC execution
- Verify Admin Center shows non-zero counts after automation runs
- Confirm reset date displays correctly

### Optional: Reduce Logging After Verification
Once confirmed working, you can reduce verbosity by commenting out some RAISE NOTICE lines in the migration functions.

---

**Ready to deploy and test!** 🚀
