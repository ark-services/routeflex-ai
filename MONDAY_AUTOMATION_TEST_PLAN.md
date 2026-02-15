# Monday.com-Style Automation Engine - Test Plan

## Overview
This test plan validates the end-to-end Monday.com-style automation engine implementation for job-level recruiting workflows.

## Prerequisites

### 1. Apply Database Migration
```bash
# Apply the new schema migration
npx supabase db push

# OR if using local Supabase
npx supabase db reset --local
```

### 2. Verify Schema Updates
```sql
-- Check that new trigger types exist
SELECT key, name FROM automation_triggers
WHERE key IN ('board.status_changes_to', 'board.date_arrives', 'board.number_changes');

-- Check that action types constraint is updated
SELECT conname, consrc
FROM pg_constraint
WHERE conrelid = 'automation_actions'::regclass
AND conname = 'automation_actions_type_check';
```

## Core User Story: Status Change → Move to Group

This is the primary test case specified in the requirements.

### Setup Phase

1. **Navigate to Job's Applicants Board**
   - Go to `/dashboard/{companyId}/jobs/{jobId}/applicants`
   - Verify the "Automate" button appears in the navigation area

2. **Create Status Column "App Status" with FADV Value**
   - Click the "+" button to add a new column
   - Name: "App Status"
   - Type: Status
   - Add status label: "FADV" with a color (e.g., orange)
   - Save the column

3. **Create Group "FADV"**
   - Click "+ Add group" button
   - Name: "FADV"
   - Verify it appears in the board's group list

### Automation Creation Phase

4. **Open Automation Overlay**
   - Click the "Automate" button
   - Verify overlay opens with "Create" and "Manage" tabs
   - Should default to "Create" tab if no automations exist

5. **Build the Recipe (Monday.com-style)**

   **Step 1: Select Trigger**
   - Click "Choose a trigger..." button
   - Verify list shows Monday.com-style triggers first:
     - "Status Column Changes To" (board.status_changes_to)
     - "Applicant Moved to Group"
     - "Applicant Created"
     - "Application Form Submitted"
   - Select "Status Column Changes To"

   **Step 2: Configure Trigger (Interactive Sentence)**
   - Verify sentence appears: "When [status column] changes to [value]"
   - Click the blue "[status column]" placeholder
   - Verify dropdown shows all status columns (including "App Status")
   - Select "App Status"
   - Click the blue "[value]" placeholder (should appear after column selection)
   - Verify dropdown shows all status labels for "App Status" column
   - Select "FADV"
   - Verify sentence now reads: "When App Status changes to FADV"

   **Step 3: Add Action**
   - Verify down arrow appears between trigger and action section
   - Verify "Add action" button appears
   - Click "Add action"
   - Verify action editor appears with dropdown selector

   **Step 4: Configure Action (Interactive Sentence)**
   - Select "Move item to group" from dropdown
   - Verify sentence appears: "move item to [group]"
   - Click the blue "[group]" placeholder
   - Verify dropdown shows all groups (including "FADV")
   - Select "FADV" group
   - Verify sentence now reads: "move item to FADV"

   **Step 5: Review & Create**
   - Verify recipe preview shows: "When App Status changes to FADV → move to FADV"
   - Verify "Create automation" button is enabled
   - Click "Create automation"
   - Verify automation is created and overlay switches to "Manage" tab

### Execution Phase

6. **Test the Automation**
   - In the Applicants Board, create a test applicant (or use existing)
   - Ensure applicant is NOT in the FADV group
   - Click on the "App Status" cell for this applicant
   - Change the status to "FADV"
   - **Expected Result**: Applicant should immediately move to the FADV group

7. **Verify Automation Run Logged**
   ```sql
   -- Check automation run was logged
   SELECT
     ar.id,
     ar.status,
     ar.error,
     ar.payload,
     a.name as automation_name
   FROM automation_runs ar
   JOIN automations a ON a.id = ar.automation_id
   WHERE ar.company_id = '{companyId}'
     AND ar.job_id = '{jobId}'
   ORDER BY ar.created_at DESC
   LIMIT 5;
   ```
   - Verify status = 'success'
   - Verify payload contains column_id, old_value, new_value
   - Verify trigger_key = 'board.status_changes_to'

## Additional Test Cases

### Test Case 2: Multiple Actions
**Scenario**: When App Status changes to FADV → move to FADV AND change another status column

1. Create second status column "Review Status"
2. Add label "Approved" to "Review Status"
3. Create automation:
   - Trigger: When "App Status" changes to "FADV"
   - Action 1: Move to group "FADV"
   - Action 2: Change status "Review Status" to "Approved"
4. Test by changing an applicant's App Status to FADV
5. Verify both actions execute in order

### Test Case 3: Set Date Action
**Scenario**: When applicant created → set "Interview Date" to tomorrow

1. Create date column "Interview Date"
2. Create automation:
   - Trigger: When applicant is created
   - Action: Set "Interview Date" to "tomorrow"
3. Test by creating a new applicant (via application form or manually)
4. Verify Interview Date cell is set to tomorrow's date

### Test Case 4: Increment Number
**Scenario**: When moved to "Phone Screen" group → increment "Contact Attempts" by 1

1. Create number column "Contact Attempts"
2. Create group "Phone Screen"
3. Create automation:
   - Trigger: When applicant moved to "Phone Screen"
   - Action: Increase "Contact Attempts" by 1
4. Test by moving an applicant to Phone Screen group
5. Verify number increments (0 → 1, or current value + 1)

### Test Case 5: Delete Item
**Scenario**: When status changes to "Rejected" → delete item

1. Add status label "Rejected" to "App Status"
2. Create automation:
   - Trigger: When "App Status" changes to "Rejected"
   - Action: Delete item
3. Test by changing an applicant's status to Rejected
4. Verify applicant is deleted from the board
5. **Warning**: This is destructive - use test data only

### Test Case 6: Slack Notification (Stub)
**Scenario**: When applicant created → send Slack message

1. Create automation:
   - Trigger: When applicant is created
   - Action: Send Slack notification
   - Webhook URL: `https://hooks.slack.com/services/TEST/WEBHOOK/URL`
   - Message: `New applicant {{applicant_id}} submitted application`
2. Test by creating a new applicant
3. Check console logs for Slack webhook call
4. (Optional) Use real Slack webhook to verify message delivery

### Test Case 7: Manage Tab Functionality

**Enable/Disable Toggle**
1. Go to Manage tab
2. Toggle automation off
3. Test the trigger condition
4. Verify automation does NOT execute
5. Toggle back on
6. Test again - verify it executes

**Duplicate Automation**
1. Click kebab menu (⋮) on an automation
2. Click "Duplicate"
3. Verify new automation appears with "(Copy)" suffix
4. Verify it has same trigger and actions
5. Test the duplicate - should work identically

**Delete Automation**
1. Click kebab menu on an automation
2. Click "Delete"
3. Confirm deletion
4. Verify automation is removed from list
5. Test the trigger - verify it does NOT execute anymore

## Edge Cases & Error Handling

### Edge Case 1: Filter Matching
**Scenario**: Automation should only fire when column_id AND value match exactly

1. Create two status columns: "App Status" and "Review Status"
2. Both have "FADV" label
3. Create automation for "App Status" → FADV
4. Change "Review Status" to FADV
5. **Expected**: Automation should NOT fire (wrong column)

### Edge Case 2: No Columns Available
**Scenario**: UI handles missing board columns gracefully

1. Open automation overlay on a fresh job with no custom columns
2. Try to create "Status changes to" trigger
3. **Expected**: Pickers show "No columns available" message

### Edge Case 3: Deleted Column/Group
**Scenario**: Automation references deleted resource

1. Create automation referencing a group
2. Delete that group
3. **Expected**: Automation run should fail gracefully with error logged

### Edge Case 4: Concurrent Updates
**Scenario**: Multiple automations on same trigger

1. Create 2 automations with same trigger
2. Fire the trigger
3. **Expected**: Both should execute in creation order

### Edge Case 5: Infinite Loop Prevention
**Scenario**: Automation shouldn't trigger itself

1. Create automation: When App Status → FADV, change App Status → Interview
2. **Expected**: Automation should fire once, not create infinite loop
3. Check code: `isFromAutomation` flag prevents re-triggering

## Performance Tests

### Performance Test 1: Many Automations
1. Create 10+ automations on different triggers
2. Fire each trigger
3. Verify performance is acceptable (< 500ms execution)

### Performance Test 2: Many Actions
1. Create automation with 5 actions
2. Fire trigger
3. Verify all actions execute in order
4. Verify execution time scales linearly

## Browser Compatibility
Test in:
- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)

## Regression Tests

Ensure existing functionality still works:
1. ✅ Board cell editing (status, date, number, text)
2. ✅ Applicant creation via form
3. ✅ Group management (create, rename, delete)
4. ✅ Column management (create, rename, delete)
5. ✅ Applicant drag-and-drop between groups

## Success Criteria

- ✅ All core user story steps complete without errors
- ✅ Automation creates and executes successfully
- ✅ UI matches Monday.com interaction model (clickable placeholders, dropdown pickers)
- ✅ Manage tab shows readable automation sentences
- ✅ Enable/disable toggle works
- ✅ Duplicate functionality works
- ✅ Delete functionality works
- ✅ Automation runs are logged with success/failure status
- ✅ No hydration mismatches in browser console
- ✅ No TypeScript compilation errors
- ✅ RLS enforces job-level access control

## Known Limitations

1. **Email action**: Stub implementation (logs to console)
2. **Slack action**: Requires valid webhook URL to test end-to-end
3. **Async queue**: Executes inline (synchronously) - queue table exists for future use
4. **Template variables**: Basic string replacement only ({{applicant_id}}, etc.)
5. **Date actions**: Limited to "today" and "tomorrow" - no custom date picker yet

## Troubleshooting

### Automation Not Firing
1. Check automation is enabled (green toggle)
2. Check filter matches exactly (column_id + value)
3. Check browser console for errors
4. Check automation_runs table for 'skipped' entries
5. Verify RLS policies allow access to job

### UI Not Updating
1. Check revalidatePath is called in server action
2. Hard refresh browser (Cmd+Shift+R)
3. Check Next.js server logs for errors

### TypeScript Errors
1. Run `npm run build` to check for compilation errors
2. Verify all imports are correct
3. Check type definitions match actual data structures

## Next Steps After Testing

If all tests pass:
1. Deploy migration to production
2. Monitor automation_runs table for errors
3. Gather user feedback on UX
4. Plan Phase 2 features:
   - Email template builder
   - Custom date picker
   - Advanced filtering (AND/OR conditions)
   - Automation analytics dashboard
