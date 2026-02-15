# Automation "Skipped" Bug Fix - Complete Solution

## Root Cause

The `matchesFilter()` function had a critical bug in its if-else chain. When evaluating `filter.changes_to`:

**Before (BROKEN):**
```typescript
for (const [key, value] of Object.entries(filter)) {
  if (key === 'column_id' && payload.column_id !== value) {
    return false;
  }
  else if (key === 'changes_to' && payload.new_value !== value) {
    return false;  // ✅ Correctly checks payload.new_value
  }
  else if (payload[key] !== value) {
    return false;  // ❌ BUG: When changes_to MATCHES, falls through here!
                   // Checks payload['changes_to'] which is undefined
                   // undefined !== value → TRUE → returns FALSE (no match!)
  }
}
```

**Flow when filter.changes_to = "uuid-123" and payload.new_value = "uuid-123":**
1. Line 2: key === 'changes_to' → TRUE
2. Line 3: payload.new_value !== value → FALSE (they match!)
3. Condition is FALSE, falls through to line 5
4. Line 5: payload['changes_to'] !== value
5. payload['changes_to'] is **undefined** (doesn't exist in payload)
6. undefined !== "uuid-123" → **TRUE**
7. **Returns FALSE** → Filter doesn't match → Automation skipped!

**After (FIXED):**
```typescript
for (const [key, value] of Object.entries(filter)) {
  if (key === 'column_id') {
    if (payload.column_id !== value) return false;
    continue; // ✅ Skip to next filter key, don't fall through
  }

  if (key === 'changes_to') {
    if (payload.new_value !== value) return false;
    continue; // ✅ Skip to next filter key, don't fall through
  }

  // Generic match for other keys
  if (payload[key] !== value) return false;
}
```

---

## Files Changed

### 1. Migration: `supabase/migrations/00029_add_automation_runs_skip_reason.sql` ✅ CREATED

Adds `skip_reason` column to `automation_runs` table for debugging:
```sql
alter table public.automation_runs
  add column if not exists skip_reason text;
```

### 2. Core Logic: `src/lib/automations/fireJobAutomation.ts` ✅ UPDATED

**Changes:**

**A) Fixed `matchesFilter()` function (lines ~194-245):**
- ✅ Added `continue` statements after special case handling
- ✅ Prevents fallthrough to generic `payload[key]` check
- ✅ Added detailed console logging for each predicate:
  - Logs filter value vs payload value
  - Logs `payload.new_value` AND `payload.new_label` for debugging
  - Logs match result for each condition

**B) Enhanced skip logging in `fireJobTrigger()` (lines ~88-145):**
- ✅ Added `skip_reason` field to all skipped runs
- ✅ Logs detailed filter evaluation predicates:
  ```typescript
  {
    automation_id,
    automation_name,
    is_enabled: true,
    trigger_key_match: true,
    filter: { column_id: "...", changes_to: "..." },
    payload_column_id: "...",
    payload_new_value: "uuid-123",
    payload_new_label: "FADV",
    payload_old_value: "uuid-456",
    payload_old_label: "Applied"
  }
  ```
- ✅ Skip reasons include:
  - "Triggered by another automation (infinite loop prevention)"
  - "Filter did not match. Filter: {...}, Payload: column_id=..., new_value=..., new_label=\"...\""

**C) Added success logging (lines ~168-190):**
- ✅ Logs final run status
- ✅ Logs number of actions executed
- ✅ Logs if automation_run insert fails (RLS debugging)
- ✅ Sets `skip_reason: null` for successful runs

**D) Added `debugAutomationRun()` function (lines ~783-831):**
- ✅ Export function to replay/trace a specific run by ID
- ✅ Fetches run details and automation config
- ✅ Re-evaluates filter to show why it matched/didn't match
- ✅ Usage:
  ```typescript
  import { debugAutomationRun } from '@/lib/automations/fireJobAutomation';
  await debugAutomationRun(supabase, 'run-uuid-here');
  ```

---

## Deployment Steps

1. **Run migration:**
   ```bash
   supabase migration up
   # OR
   psql $DATABASE_URL -f supabase/migrations/00029_add_automation_runs_skip_reason.sql
   ```

2. **Deploy updated code** (fireJobAutomation.ts changes)

3. **Clear any cached automation runs** (optional, for clean slate)

---

## Test Checklist

### Test 1: Trigger Change → Run Created → Run Success → Item Moved

1. **Setup:**
   - Ensure you have an automation:
     - Trigger: "When App Status changes to FADV"
     - Action: "Move to group FADV"
     - is_enabled = true

2. **Trigger:**
   - Go to Applicants Board
   - Change an applicant's "App Status" to "FADV"

3. **Expected Server Logs:**
   ```
   [updateBoardCell] Called with parameters: { ... }
   [updateBoardCell] Success: [...]

   [fireJobTrigger] ========================================
   [fireJobTrigger] Trigger fired: { trigger_key: 'board.status_changes_to', ... }
   [fireJobTrigger] Found automations: 1
   [fireJobTrigger] Checking automation: { id: '...', name: 'When App Status changes to FADV → move to FADV' }
   [fireJobTrigger] Evaluating filter predicates: {
     filter: { column_id: '...', changes_to: '...' },
     payload_column_id: '...',
     payload_new_value: 'uuid-of-fadv-label',
     payload_new_label: 'FADV',
     ...
   }

   [matchesFilter] Evaluating filter: { column_id: '...', changes_to: '...' }
   [matchesFilter] Against payload: { column_id: '...', new_value: '...', new_label: 'FADV', ... }
   [matchesFilter] column_id: filter=..., payload=..., match=true
   [matchesFilter] changes_to: filter=uuid-fadv, payload.new_value=uuid-fadv, payload.new_label="FADV", match=true
   [matchesFilter] ✓ All filter conditions matched

   [fireJobTrigger] ✓ Filter matched! Executing actions...
   [fireJobTrigger] Executing action: { type: 'move_group', config: { to_group_id: '...' } }

   [executeMoveGroup] Starting: { to_group_id: 'uuid-fadv-group', applicantId: '...', ... }
   [executeMoveGroup] Current applicant: { found: true, applicant: { full_name: 'John Doe', ... } }
   [executeMoveGroup] Target group check: { groupExists: true, groupName: 'FADV' }
   [executeMoveGroup] Update result: { rowsAffected: 1 }
   [executeMoveGroup] ✓ Successfully moved applicant: { name: 'John Doe', toGroup: 'FADV', rowsAffected: 1 }

   [fireJobTrigger] Action result: { success: true }
   [fireJobTrigger] ✓ Action succeeded
   [fireJobTrigger] Final run status: success
   [fireJobTrigger] Actions executed: 1
   [fireJobTrigger] Run error: none
   [fireJobTrigger] ✓ Automation run logged successfully
   [fireJobTrigger] ========================================
   ```

4. **Expected Database:**
   - Query automation_runs:
     ```sql
     SELECT id, status, skip_reason, error, payload->>'new_label' as new_label
     FROM automation_runs
     WHERE automation_id = 'your-automation-id'
     ORDER BY created_at DESC
     LIMIT 1;
     ```
   - **Expected:**
     - `status = 'success'`
     - `skip_reason IS NULL`
     - `error IS NULL`
     - `new_label = 'FADV'`

5. **Expected UI:**
   - ✅ Applicant immediately moves to FADV group (within 1-2 seconds)
   - ✅ No page refresh needed
   - ✅ After hard refresh (Cmd+Shift+R), applicant still in FADV group

---

### Test 2: Filter Doesn't Match → Run Skipped with Reason

1. **Trigger:**
   - Change an applicant's "App Status" to **"Interview"** (NOT "FADV")

2. **Expected Server Logs:**
   ```
   [fireJobTrigger] Trigger fired: { trigger_key: 'board.status_changes_to', ... }
   [fireJobTrigger] Found automations: 1
   [fireJobTrigger] Evaluating filter predicates: {
     filter: { column_id: '...', changes_to: 'uuid-fadv' },
     payload_new_value: 'uuid-interview',
     payload_new_label: 'Interview',
   }

   [matchesFilter] column_id: filter=..., payload=..., match=true
   [matchesFilter] changes_to: filter=uuid-fadv, payload.new_value=uuid-interview, payload.new_label="Interview", match=false

   [fireJobTrigger] SKIP: Filter did not match. Filter: {...}, Payload: column_id=..., new_value=uuid-interview, new_label="Interview"
   ```

3. **Expected Database:**
   - Query automation_runs:
     ```sql
     SELECT status, skip_reason, payload->>'new_label' as new_label
     FROM automation_runs
     ORDER BY created_at DESC
     LIMIT 1;
     ```
   - **Expected:**
     - `status = 'skipped'`
     - `skip_reason = 'Filter did not match. Filter: {...}, Payload: ...'`
     - `new_label = 'Interview'`

4. **Expected UI:**
   - ✅ Applicant does NOT move
   - ✅ Stays in current group

---

### Test 3: Debug Existing Run (Optional)

If you have a run ID that was previously skipped and want to trace why:

1. **In your server console or a server action:**
   ```typescript
   import { createClient } from '@/lib/supabase/server';
   import { debugAutomationRun } from '@/lib/automations/fireJobAutomation';

   const supabase = await createClient();
   await debugAutomationRun(supabase, 'run-id-here');
   ```

2. **Expected Output:**
   ```
   [debugAutomationRun] ========================================
   [debugAutomationRun] Fetching run: run-id-here
   [debugAutomationRun] Run details: {
     id: '...',
     status: 'skipped',
     skip_reason: 'Filter did not match...',
     trigger_key: 'board.status_changes_to',
     ...
   }
   [debugAutomationRun] Payload: { column_id: '...', new_value: '...', new_label: 'FADV', ... }
   [debugAutomationRun] Automation: {
     name: 'When App Status changes to FADV → move to FADV',
     filter: { column_id: '...', changes_to: '...' },
     actions: [{ type: 'move_group', config: { to_group_id: '...' } }]
   }
   [debugAutomationRun] Re-evaluating filter...
   [matchesFilter] column_id: filter=..., payload=..., match=true
   [matchesFilter] changes_to: filter=..., payload.new_value=..., match=true
   [matchesFilter] ✓ All filter conditions matched
   [debugAutomationRun] Filter result: ✓ MATCH
   [debugAutomationRun] ========================================
   ```

---

## Key Changes Summary

| Issue | Before | After |
|-------|--------|-------|
| **Filter matching** | Falls through to `payload['changes_to']` check → undefined !== value → FALSE | Uses `continue` to skip rest of loop after special cases → TRUE |
| **Skip visibility** | `status='skipped'`, `error=null`, no reason | `status='skipped'`, `skip_reason='Filter did not match. ...'` |
| **Logging detail** | Minimal | Logs every predicate, payload values, filter values, match results |
| **Debugging** | No tooling | `debugAutomationRun(supabase, runId)` to replay evaluation |

---

## Common Issues & Solutions

### Issue: Still showing "skipped" after fix

**Check:**
1. Did you run migration 00029?
2. Did you deploy the updated fireJobAutomation.ts?
3. Check server logs - does it now show `[matchesFilter]` logs?

**Solution:**
- Restart your dev server
- Clear any cached builds: `rm -rf .next && npm run dev`

### Issue: Filter matches but action doesn't execute

**Check server logs for:**
```
[executeMoveGroup] CRITICAL: No rows updated despite SELECT permission!
```

**Solution:**
- This means RLS is blocking the UPDATE (see previous fix for migration 00027)
- Or the group_id/applicant_id is wrong

### Issue: Can't find debugAutomationRun

**Solution:**
```typescript
// Create a test API route or server action:
// app/api/debug-automation/route.ts
import { createClient } from '@/lib/supabase/server';
import { debugAutomationRun } from '@/lib/automations/fireJobAutomation';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('runId');

  if (!runId) {
    return Response.json({ error: 'Missing runId' }, { status: 400 });
  }

  const supabase = await createClient();
  await debugAutomationRun(supabase, runId);

  return Response.json({ success: true });
}

// Then visit: /api/debug-automation?runId=your-run-uuid
```

---

## Success Metrics

After deployment:
- ✅ **Automation runs show status='success'** (not 'skipped')
- ✅ **skip_reason is null** for successful runs
- ✅ **skip_reason contains explanation** for skipped runs
- ✅ **Server logs show detailed filter evaluation**
- ✅ **Actions execute and applicants move**
- ✅ **Database persists changes**

---

## Rollback

If needed:

```bash
# Rollback code
git checkout HEAD~1 -- src/lib/automations/fireJobAutomation.ts

# Rollback migration (optional - skip_reason column won't hurt)
psql $DATABASE_URL -c "ALTER TABLE automation_runs DROP COLUMN IF EXISTS skip_reason;"
```
