# Job-Level Automation Engine - Testing Guide

## Quick Test Checklist

### Step 1: Apply Migration

```bash
# If using local Supabase
npx supabase db reset --local

# Or push to remote
npx supabase db push
```

Verify migration succeeded:
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'automation%';

-- Should return:
-- automation_triggers
-- automations
-- automation_actions
-- automation_runs
-- automation_queue

-- Check triggers seeded
SELECT key, name FROM automation_triggers ORDER BY key;

-- Should return 5 triggers:
-- applicant.created
-- applicant.moved_group
-- applicant.status_changed
-- board.column_changed
-- form.submitted
```

### Step 2: Navigate to Job Board

1. Log in to your app
2. Navigate to: `/dashboard/[companyId]/jobs/[jobId]/applicants`
3. Verify "Automate" button appears in top-right corner (purple button with lightning icon)

### Step 3: Create Your First Automation

1. Click the **"Automate"** button
2. Should see overlay with two tabs: "Manage" and "Create"
3. Click **"Create"** tab (if not already active)
4. Click **"When this happens..."** dropdown
5. Search for "form submitted" or scroll to find **"Application Form Submitted"**
6. Click to select it
7. Recipe preview should appear at top: "When application form submitted, then..."
8. Click **"Then do this..."** and click **"Add action"**
9. Select **"Move to group"** from dropdown
10. Select a target group (e.g., "Screening" or "Interview")
11. Recipe preview updates: "When application form submitted, then move to group"
12. Click **"Create automation"**
13. Overlay should switch to "Manage" tab
14. Should see your automation listed with:
    - Recipe sentence
    - Green "Active" badge
    - Power icon (enabled)
    - Kebab menu

### Step 4: Test the Automation

**Option A: Submit Application Form**

1. Go to your job's public application form
2. Fill out and submit an application
3. Go back to job board: `/dashboard/[companyId]/jobs/[jobId]/applicants`
4. Verify the new applicant is in the target group you selected (e.g., "Screening")
5. Click "Automate" button and go to "Manage" tab
6. Verify automation shows recent activity

**Option B: Move Applicant Manually (Test "moved_group" trigger)**

1. Create a second automation:
   - Trigger: "Applicant Moved to Group"
   - Filter: Select "to group" = "Interview" (or any group)
   - Action: "Set status" = "interviewing"
2. On the board, drag an applicant to the "Interview" group
3. Verify the applicant's status automatically changes to "interviewing"

### Step 5: Verify Automation Runs

Query the database to see execution history:

```sql
-- View recent automation runs for a job
SELECT
  ar.created_at,
  a.name as automation_name,
  ar.trigger_key,
  ar.status,
  ar.error,
  ar.payload
FROM automation_runs ar
LEFT JOIN automations a ON a.id = ar.automation_id
WHERE ar.job_id = 'your-job-id-here'
ORDER BY ar.created_at DESC
LIMIT 20;

-- Check for failures
SELECT * FROM automation_runs
WHERE job_id = 'your-job-id-here'
  AND status = 'failed'
ORDER BY created_at DESC;
```

Expected results:
- `status` = 'success' (or 'skipped' if filter didn't match)
- `error` = NULL
- `payload` contains event data (applicant_id, job_id, etc.)
- `created_at` shows recent timestamp

### Step 6: Test Toggle On/Off

1. Click "Automate" button → "Manage" tab
2. Click the power icon to disable an automation
3. Badge should change to gray "Inactive"
4. Perform an action that would trigger it (e.g., submit form)
5. Verify automation does NOT run
6. Enable it again and verify it works

### Step 7: Test Multiple Actions

1. Create automation with multiple actions:
   - Trigger: "Application Form Submitted"
   - Action 1: "Move to group" = "Screening"
   - Action 2: "Set status" = "screening"
2. Submit an application
3. Verify both actions executed:
   - Applicant is in "Screening" group
   - Applicant status is "screening"

### Step 8: Test Delete

1. Click kebab menu (three dots) on an automation
2. Click "Delete"
3. Confirm deletion
4. Verify automation is removed from list

---

## Advanced Testing

### Test Filter Matching

Create automation with filter:
1. Trigger: "Applicant Moved to Group"
2. Filter: "to group" = "Interview" (specific group)
3. Action: "Set status" = "interviewing"

Test:
- Move applicant to "Interview" → automation fires ✅
- Move applicant to "Screening" → automation does NOT fire ✅

### Test Multiple Automations (Same Trigger)

Create two automations for same trigger:
1. "When form submitted, then move to Screening"
2. "When form submitted, then set status to applied"

Submit form → both should fire in order created.

### Test Webhook Action

1. Set up a webhook receiver (e.g., webhook.site)
2. Create automation:
   - Trigger: "Application Form Submitted"
   - Action: "Send webhook"
   - URL: Your webhook URL
3. Submit application
4. Check webhook site → should receive POST with payload

### Test Email Action (Stub)

1. Create automation with "Send email" action
2. Trigger it
3. Check server logs for email preview:

```bash
# View logs
npx supabase logs
# or check console output

# Should see:
[send_email] Email preview: { to: '...', subject: '...', body: '...' }
```

### Test Infinite Loop Prevention

1. Create automation:
   - Trigger: "Applicant Moved to Group"
   - Action: "Move to group" (different group)
2. Move applicant manually
3. Verify automation fires ONCE (not infinite loop)
4. Check `automation_runs` → second move should have `source: 'automation'` in payload
5. Verify no automation fired from the automated move (skipped)

---

## Troubleshooting

### Automations Not Firing

1. **Check automation is enabled**
   ```sql
   SELECT id, name, is_enabled, trigger_key
   FROM automations
   WHERE job_id = 'your-job-id';
   ```

2. **Check trigger key matches**
   - Form submission fires: `form.submitted` AND `applicant.created`
   - Manual applicant move fires: `applicant.moved_group`
   - Status change fires: `applicant.status_changed`

3. **Check filter matching**
   ```sql
   SELECT id, name, filter FROM automations WHERE job_id = 'your-job-id';
   ```
   - Empty `{}` = matches all
   - `{"to_group_id": "abc"}` = only matches if payload.to_group_id === "abc"

4. **Check RLS permissions**
   ```sql
   SELECT can_access_job('your-job-id');
   -- Should return: true
   ```

5. **Check for errors**
   ```sql
   SELECT * FROM automation_runs
   WHERE job_id = 'your-job-id'
     AND status = 'failed'
   ORDER BY created_at DESC;
   ```

### Overlay Not Opening

- Check browser console for errors
- Verify button onClick handler is working
- Check that AutomationOverlay component is imported correctly
- Verify data is being passed to overlay (automations, triggers, groups)

### Actions Failing

1. **move_group fails**
   - Verify `to_group_id` exists in `board_groups`
   - Verify group belongs to same board as applicant
   - Check `applicant_id` is valid

2. **set_status fails**
   - Verify status is valid (applied, screening, etc.)
   - Check applicant exists

3. **webhook fails**
   - Verify URL is reachable
   - Check server logs for fetch errors
   - Test URL manually with curl/Postman

### TypeScript Errors

```bash
# Check for TypeScript errors
npx tsc --noEmit

# If errors about missing types, add to tsconfig.json:
"include": ["src/**/*.ts", "src/**/*.tsx"]
```

---

## Database Queries for Debugging

### View All Automations for Job

```sql
SELECT
  a.id,
  a.name,
  a.is_enabled,
  a.trigger_key,
  a.filter,
  a.created_at,
  json_agg(
    json_build_object(
      'type', aa.type,
      'config', aa.config,
      'sort_order', aa.sort_order
    ) ORDER BY aa.sort_order
  ) as actions
FROM automations a
LEFT JOIN automation_actions aa ON aa.automation_id = a.id
WHERE a.job_id = 'your-job-id'
GROUP BY a.id
ORDER BY a.created_at DESC;
```

### View Recent Runs with Details

```sql
SELECT
  ar.created_at,
  a.name as automation,
  ar.trigger_key,
  ar.subject_type,
  ar.subject_id,
  ar.status,
  ar.error,
  ar.payload->'applicant_id' as applicant_id,
  ar.payload->'group_id' as group_id
FROM automation_runs ar
LEFT JOIN automations a ON a.id = ar.automation_id
WHERE ar.job_id = 'your-job-id'
ORDER BY ar.created_at DESC
LIMIT 50;
```

### Count Runs by Status

```sql
SELECT
  status,
  count(*) as count
FROM automation_runs
WHERE job_id = 'your-job-id'
GROUP BY status;
```

### Find Automations That Never Fired

```sql
SELECT
  a.id,
  a.name,
  a.trigger_key,
  a.is_enabled,
  count(ar.id) as run_count
FROM automations a
LEFT JOIN automation_runs ar ON ar.automation_id = a.id
WHERE a.job_id = 'your-job-id'
GROUP BY a.id
HAVING count(ar.id) = 0;
```

---

## Expected Behavior Summary

✅ **Overlay opens** when clicking "Automate" button
✅ **Create tab** shows searchable trigger list
✅ **Recipe sentence preview** updates as you build
✅ **Contextual filters** appear based on trigger (e.g., group filter for moved_group)
✅ **Multiple actions** can be added (up to 3)
✅ **Create button** persists automation and switches to Manage tab
✅ **Manage tab** shows all automations with toggle and delete
✅ **Form submission** fires both `form.submitted` and `applicant.created` triggers
✅ **Manual actions** (move, status change) fire corresponding triggers
✅ **Automations execute** actions in sort_order
✅ **Automation runs** are logged with success/failed status
✅ **Infinite loops prevented** by skipping automation-sourced triggers
✅ **RLS enforced** - users only see automations for jobs they can access
✅ **Job-scoped** - automations only fire for events on their specific job

---

## Performance Notes

- Automations execute inline (blocking) for now
- Each trigger fires synchronously during the mutation
- For high-volume jobs (>100 applicants/day), consider:
  - Moving to async queue processing
  - Adding indexes on `automation_runs(job_id, created_at)`
  - Archiving old runs (>30 days)
  - Limiting enabled automations per trigger

---

## Next Steps

After confirming basic functionality:

1. **Add more triggers**: job.renamed, group.renamed, etc.
2. **Implement email service**: Replace stub with SendGrid/Resend
3. **Add automation templates**: Pre-built recipes users can clone
4. **Add run history UI**: Show last 10 runs in Manage tab
5. **Add duplicate automation**: Clone existing automation
6. **Add conditional logic**: IF/THEN/ELSE branches
7. **Add time delays**: "Wait 2 days, then..." actions
8. **Add analytics**: Automation performance dashboard
