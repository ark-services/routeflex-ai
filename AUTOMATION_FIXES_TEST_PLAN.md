# Automation Fixes - Test Plan

## Overview
This document covers testing for three automation improvements:
1. Remove helper text in Create view
2. Add ability to edit existing automation recipes
3. Fix automation execution bug (status change → move group)

## Prerequisites
No database migration needed - all changes are code-only.

---

## Test 1: Verify Helper Text Removed

### Steps
1. Navigate to any job's Applicants Board
2. Click the "Automate" button
3. Click the "Create" tab

### Expected Result
- ✅ Title shows "Create Automation Recipe" with lightning bolt icon
- ✅ NO helper text below the title (the sentence "Build a Monday.com-style automation..." should be gone)
- ✅ Builder starts immediately with "When this happens..." section

### Pass Criteria
Helper text is removed and layout looks clean

---

## Test 2: Edit Existing Automation

### Setup
1. Create a test automation first:
   - Trigger: "When App Status changes to FADV"
   - Action: "Move to group FADV"
   - Save it

### Test 2A: Open Edit Mode

**Steps:**
1. Go to Manage tab
2. Find the automation you just created
3. Click the kebab menu (⋮)
4. Verify "Edit" appears as the FIRST menu item
5. Click "Edit"

**Expected Result:**
- ✅ Switches to Create tab automatically
- ✅ Title changes to "Edit Automation Recipe"
- ✅ Trigger is pre-filled: "When [App Status] changes to [FADV]"
- ✅ Action is pre-filled: "move item to [FADV]"
- ✅ Button shows "Update automation" instead of "Create automation"
- ✅ "Cancel" button appears next to Update button

### Test 2B: Make Changes and Save

**Steps:**
1. While in edit mode, change the trigger value:
   - Click the [FADV] placeholder in the trigger
   - Select a different status (e.g., "Interview")
2. Change the target group:
   - Click the [FADV] placeholder in the action
   - Select a different group (e.g., "Interview")
3. Click "Update automation"

**Expected Result:**
- ✅ Switches back to Manage tab
- ✅ Automation name updates to: "When App Status changes to Interview → move to Interview"
- ✅ No duplicate automation created (still just 1 automation)
- ✅ Automation ID stays the same (check automation_runs table if needed)

### Test 2C: Cancel Edit

**Steps:**
1. Click Edit on an automation
2. Make some changes (don't save)
3. Click "Cancel" button

**Expected Result:**
- ✅ Returns to Manage tab
- ✅ Automation is unchanged
- ✅ No errors in console

### Test 2D: Edit Multiple Actions

**Steps:**
1. Create automation with 2 actions:
   - Trigger: "When App Status changes to FADV"
   - Action 1: Move to group FADV
   - Action 2: Set Interview Date to tomorrow
2. Edit it and change Action 2 to "Set Interview Date to today"
3. Save

**Expected Result:**
- ✅ Both actions are updated correctly
- ✅ Action order preserved (Action 1 still first, Action 2 still second)

---

## Test 3: Fix Status Change → Move Group Bug

This is the CRITICAL test. The automation must actually execute.

### Setup Phase

#### Step 1: Create Status Column "App Status"
1. Go to Applicants Board
2. Click "+" to add new column
3. Name: "App Status"
4. Type: Status
5. Add status labels:
   - "Applied" (any color)
   - "FADV" (orange/red)
   - "Interview" (blue)
6. Save

#### Step 2: Create Group "FADV"
1. Click "+ Add group"
2. Name: "FADV"
3. Save
4. Verify it appears in the board

#### Step 3: Create Test Applicant
1. Ensure you have at least one applicant in "New Applicants" group
2. Set their "App Status" to "Applied" (or blank)

### Test Execution

#### Step 4: Create Automation
1. Click "Automate" button
2. Create tab
3. Select trigger: "Status Column Changes To"
4. Click [status column] → Select "App Status"
5. Click [value] → Select "FADV"
6. Add action: "Move item to group"
7. Click [group] → Select "FADV"
8. Verify recipe preview: "When App Status changes to FADV → move to FADV"
9. Click "Create automation"
10. Verify it appears in Manage tab as ACTIVE (green toggle)

#### Step 5: Trigger the Automation
1. Go to Applicants Board
2. Find the test applicant (should be in "New Applicants" group)
3. Click on their "App Status" cell
4. Select "FADV" from the dropdown
5. **Click outside the cell** to blur/save (important!)

#### Step 6: Verify Execution

**Expected Result (IMMEDIATE):**
- ✅ Within 1-2 seconds, applicant **automatically moves** to the FADV group
- ✅ You see the applicant disappear from "New Applicants"
- ✅ You see the applicant appear in "FADV" group
- ✅ No page refresh needed to see the move

**Expected Result (AFTER REFRESH):**
- ✅ Refresh the page (hard refresh: Cmd+Shift+R)
- ✅ Applicant still in FADV group (database persisted)

#### Step 7: Check Logs

**Server Console Logs:**
Look for these debug logs in your terminal:

```
[fireJobTrigger] ========================================
[fireJobTrigger] Trigger fired: { trigger_key: 'board.status_changes_to', ... }
[fireJobTrigger] Found automations: 1
[fireJobTrigger] Checking automation: { id: '...', name: 'When App Status changes to FADV → move to FADV', filter: {...} }
[fireJobTrigger] Filter matching result: { matches: true, ... }
[fireJobTrigger] ✓ Filter matched! Executing actions...
[fireJobTrigger] Executing action: { type: 'move_group', config: { to_group_id: '...' } }
[executeMoveGroup] Starting: { to_group_id: '...', applicantId: '...', ... }
[executeMoveGroup] Current applicant: { group_id: '...', full_name: '...' }
[executeMoveGroup] ✓ Successfully moved applicant: { from_group: '...', to_group: '...', rows_affected: 1 }
[fireJobTrigger] Action result: { success: true }
[fireJobTrigger] ✓ Action succeeded
[fireJobTrigger] Final run status: success
[fireJobTrigger] ========================================
```

**Database Check:**
```sql
SELECT
  ar.id,
  ar.status,
  ar.error,
  ar.payload->>'column_name' as column,
  ar.payload->>'new_label' as new_value,
  a.name as automation_name,
  ar.created_at
FROM automation_runs ar
JOIN automations a ON a.id = ar.automation_id
WHERE ar.job_id = '{your-job-id}'
ORDER BY ar.created_at DESC
LIMIT 5;
```

**Expected:**
- ✅ Latest run has `status = 'success'`
- ✅ `error` is NULL
- ✅ `column = 'App Status'`
- ✅ `new_value = 'FADV'`
- ✅ `created_at` is recent (within last minute)

#### Step 8: Test Different Status Values
1. Move the applicant back to "New Applicants" (manually drag)
2. Change "App Status" to "Interview" (NOT FADV)
3. **Expected:** Applicant does NOT move (automation should not fire)
4. Change "App Status" to "FADV"
5. **Expected:** Applicant moves to FADV group again

---

## Troubleshooting

### Issue: Automation doesn't fire at all

**Check:**
1. Is automation enabled? (green toggle in Manage tab)
2. Check server console for `[fireJobTrigger]` logs
3. Check if `updateBoardCell` is being called (should see logs)
4. Verify status column ID matches filter

**Fix:**
- Check browser console for errors
- Check that you clicked outside the cell to trigger blur
- Verify the status column is actually named "App Status"

### Issue: Filter doesn't match

**Check server logs for:**
```
[fireJobTrigger] Filter matching result: { matches: false, ... }
```

**Common causes:**
- `column_id` in filter doesn't match `column_id` in payload
- `changes_to` value doesn't match `new_value` in payload
- Status label ID mismatch

**Fix:**
- Delete automation and recreate it
- Ensure you selected the correct column and value

### Issue: Action fails

**Check server logs for:**
```
[executeMoveGroup] ✗ Update failed: ...
```

**Common causes:**
- `to_group_id` missing in action config
- `applicant_id` missing in payload
- RLS blocking the update (user not member of company)

**Fix:**
- Check `applicants` table RLS policies
- Verify user is member of the company
- Check that group exists

### Issue: UI doesn't update after move

**Check:**
- Did the database actually update? (check `applicants.group_id`)
- Look for `revalidatePath` calls in logs
- Try hard refresh (Cmd+Shift+R)

**Fix:**
- The `updateBoardCell` function should call `revalidatePath` at the end
- If database updated but UI didn't, it's a revalidation issue

---

## Success Criteria

### All Tests Must Pass:
- ✅ Helper text removed from Create tab
- ✅ Edit button appears in kebab menu
- ✅ Edit mode pre-fills form correctly
- ✅ Update button works and doesn't create duplicates
- ✅ Cancel button returns to Manage without saving
- ✅ **Status change automation ACTUALLY MOVES the applicant**
- ✅ Move persists after page refresh (database updated)
- ✅ automation_runs shows success status
- ✅ Server logs show full execution trace

### Performance:
- ✅ Automation executes within 1-2 seconds
- ✅ No infinite loops
- ✅ No duplicate automation runs

### Edge Cases:
- ✅ Changing to different status value doesn't trigger automation
- ✅ Editing automation multiple times works correctly
- ✅ Canceling edit doesn't corrupt data

---

## Rollback Plan

If any test fails critically:

1. **Rollback code changes:**
   ```bash
   git checkout HEAD~1
   ```

2. **Critical files to check:**
   - `src/components/automations/CreateTab.tsx`
   - `src/components/automations/ManageTab.tsx`
   - `src/components/automations/AutomationOverlay.tsx`
   - `src/app/dashboard/[companyId]/jobs/[jobId]/automations/actions.ts`
   - `src/lib/automations/fireJobAutomation.ts`

3. **No database rollback needed** (code-only changes)

---

## Known Limitations

1. **Debug logging is verbose** - This is intentional for troubleshooting. Remove or reduce logs in production.
2. **Automation execution is synchronous** - This is acceptable for v1. Move to queue processing later if needed.
3. **Edit mode doesn't preserve disabled state** - Editing always enables the automation. This is acceptable.

---

## Next Steps After Testing

1. If all tests pass:
   - Remove or reduce debug logging
   - Deploy to production
   - Monitor automation_runs for errors

2. If Test 3 fails:
   - Review server logs carefully
   - Check RLS policies on applicants table
   - Verify filter matching logic
   - Test with simpler automation first

3. Phase 2 features:
   - Add automation analytics dashboard
   - Add "Test" button to manually fire automation
   - Add automation history view
   - Add bulk enable/disable
