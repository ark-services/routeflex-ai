# Automation Engine Implementation

## Overview

A comprehensive automation engine has been implemented for the recruiting SaaS platform. This system allows companies to create rule-based automations that trigger on specific events and execute actions automatically.

## Architecture

### Core Components

1. **Database Schema** (`supabase/migrations/00024_automation_engine.sql`)
   - `automation_triggers` - Catalog of supported trigger types
   - `automations` - Company-owned automation rules
   - `automation_actions` - Actions attached to automations (sorted execution)
   - `automation_runs` - Execution history and logging
   - `automation_queue` - Queue for future async processing (currently executes inline)

2. **Trigger Engine** (`src/lib/automations/fire.ts`)
   - Central automation execution logic
   - Filter matching
   - Action execution in sort order
   - Stops on first failure
   - Comprehensive logging

3. **Server Actions** (`src/app/dashboard/[companyId]/automations/actions.ts`)
   - List automations
   - Create automation
   - Toggle enabled/disabled
   - Delete automation
   - Test fire automation
   - Get automation run history

4. **UI** (`src/app/dashboard/[companyId]/automations/`)
   - Automation management interface
   - Create automation modal
   - Enable/disable toggle
   - Delete functionality

## Supported Triggers

### Applicant Triggers
- `applicant.created` - New applicant added
- `applicant.updated` - Applicant data modified
- `applicant.moved_group` - Applicant moved between groups
- `applicant.status_changed` - Applicant status changed
- `applicant.cell_updated` - Board cell updated
- `form.submitted` - Application form submitted

### Group Triggers
- `group.created` - New board group created
- `group.renamed` - Group renamed
- `group.deleted` - Group deleted
- `group.reordered` - Groups reordered

### Column Triggers
- `column.created` - New board column created
- `column.renamed` - Column renamed
- `column.deleted` - Column deleted
- `column.hidden_changed` - Column visibility changed

### Job Triggers
- `job.renamed` - Job renamed
- `job.duplicated` - Job duplicated
- `job.deleted` - Job deleted

### Company Triggers
- `company.renamed` - Company renamed
- `company.duplicated` - Company duplicated
- `company.deleted` - Company deleted

## Supported Actions

1. **move_group**
   - Config: `{ to_group_id: uuid }`
   - Moves applicant to specified group

2. **set_status**
   - Config: `{ status: text }`
   - Updates applicant status

3. **webhook**
   - Config: `{ url: text, method?: 'POST', headers?: object }`
   - Sends HTTP request with event payload

4. **send_email**
   - Config: `{ to_email?: string, subject: string, body: string }`
   - Currently a stub (logs preview)
   - Ready for integration with SendGrid/Resend/etc.

## Event Hooks Wired

The following server actions now fire automation triggers:

### Applicants (`src/app/dashboard/[companyId]/applicants/actions.ts`)
- ✅ `updateApplicantStatus` → `applicant.status_changed`
- ✅ `bulkMoveApplicants` → `applicant.moved_group`
- ✅ `moveApplicant` → `applicant.moved_group`
- ✅ `updateBoardCell` → `applicant.cell_updated`
- ✅ `createGroup` → `group.created`
- ✅ `createBoardColumn` → `column.created`
- ✅ `updateBoardColumn` → `column.renamed` (when name changes)
- ✅ `deleteBoardColumn` → `column.deleted`

### Forms (`src/app/apply/[jobId]/[token]/actions.ts`)
- ✅ `submitApplication` → `form.submitted`

### Future Hooks (not yet implemented in codebase)
- Job rename/duplicate/delete actions
- Company rename/duplicate/delete actions
- Group rename/delete actions
- Column visibility toggle

## Security & Multi-Tenancy

### Row-Level Security (RLS)
- All automation tables have RLS enabled
- Helper function `is_company_member(company_id)` validates access
- Users can only manage automations for companies they're members of
- Automation runs are scoped to company_id

### Execution Safety
- Automations only operate on data within the same company
- Filter matching prevents cross-company data access
- All actions validate company_id before execution
- Errors are logged but don't break application flow

## Filter Matching

Filters are JSON objects where all keys must match the event payload:

```json
{
  "job_id": "123-456-789",
  "group_id": "abc-def-ghi"
}
```

This automation will only fire if the event payload contains:
- `job_id === "123-456-789"` AND
- `group_id === "abc-def-ghi"`

Empty filter `{}` matches all events for that trigger.

## Files Created/Modified

### New Files
1. `/supabase/migrations/00024_automation_engine.sql` - Database schema
2. `/src/lib/automations/fire.ts` - Trigger engine
3. `/src/app/dashboard/[companyId]/automations/actions.ts` - Server actions
4. `/src/app/dashboard/[companyId]/automations/page.tsx` - UI page
5. `/src/app/dashboard/[companyId]/automations/AutomationsClient.tsx` - UI client component

### Modified Files
1. `/src/app/dashboard/[companyId]/applicants/actions.ts` - Added trigger firing
2. `/src/app/apply/[jobId]/[token]/actions.ts` - Added form.submitted trigger

## Testing

### Step 1: Apply Migration

```bash
# If using local Supabase
npx supabase db reset --local

# Or push to remote
npx supabase db push
```

### Step 2: Create an Automation

1. Navigate to `/dashboard/[companyId]/automations`
2. Click "Create Automation"
3. Fill in:
   - **Name**: "Auto-move new applicants to screening"
   - **Trigger**: `form.submitted`
   - **Action Type**: "Move to Group"
   - **Target Group**: Select "Screening" group
4. Click "Create"

### Step 3: Test the Automation

**Option A: Submit an Application**
1. Go to your job's application form
2. Fill out and submit the application
3. Check the applicants board - new applicant should be in "Screening" group
4. Go to `/dashboard/[companyId]/automations` - verify automation run is logged

**Option B: Use Test Fire (Direct)**
1. Go to `/dashboard/[companyId]/automations`
2. Use browser console to call test fire:

```javascript
// Get an actual applicant ID from your database
const applicantId = "your-applicant-id";
const groupId = "your-target-group-id";

await fetch('/api/test-automation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    companyId: "your-company-id",
    trigger_key: "applicant.moved_group",
    subject_type: "applicant",
    subject_id: applicantId,
    payload: {
      company_id: "your-company-id",
      applicant_id: applicantId,
      from_group_id: "old-group-id",
      to_group_id: groupId
    }
  })
});
```

**Option C: Trigger via UI Actions**
1. Move an applicant between groups → fires `applicant.moved_group`
2. Update an applicant's status → fires `applicant.status_changed`
3. Edit a cell value → fires `applicant.cell_updated`
4. Create a new group → fires `group.created`

### Step 4: Verify Execution

1. Check automation runs table:
```sql
SELECT * FROM automation_runs
WHERE company_id = 'your-company-id'
ORDER BY created_at DESC
LIMIT 10;
```

2. Verify:
   - `status` = 'success' or 'failed'
   - `error` is null for successful runs
   - `payload` contains event data
   - `created_at` shows recent timestamp

### Step 5: Test Multiple Actions

1. Create an automation with multiple actions:
   - Trigger: `form.submitted`
   - Action 1: Move to group (Screening)
   - Action 2: Set status (screening)

2. Submit an application
3. Verify both actions executed in order

## Future Enhancements

### Async Processing
Currently automations execute inline (blocking). To scale:
1. Write to `automation_queue` table
2. Create background worker (Supabase Edge Function or separate service)
3. Process queue entries asynchronously
4. Update `automation_runs` with results

### Advanced Features
- [ ] Conditional logic (IF/THEN/ELSE)
- [ ] Time-based delays ("Wait 2 days, then...")
- [ ] Email templates with variable substitution
- [ ] Slack/Teams notifications
- [ ] Multiple trigger conditions (AND/OR)
- [ ] Action retry logic with exponential backoff
- [ ] Automation analytics dashboard
- [ ] Duplicate automation
- [ ] Import/export automation templates

### Action Implementations
- [ ] Complete email integration (SendGrid/Resend)
- [ ] SMS via Twilio
- [ ] Slack webhook
- [ ] Custom field updates
- [ ] Create tasks/reminders
- [ ] Tag applicants

## Troubleshooting

### Automations Not Firing

1. **Check automation is enabled**
   ```sql
   SELECT id, name, is_enabled FROM automations WHERE company_id = 'xxx';
   ```

2. **Check trigger key matches**
   - Verify trigger_key in automation matches fired event

3. **Check filter matching**
   - Empty filter `{}` matches all
   - Non-empty filter must match ALL keys in payload

4. **Check RLS permissions**
   - User must be member of company
   - `is_company_member(company_id)` must return true

### Actions Failing

1. **Check automation_runs table**
   ```sql
   SELECT status, error, payload
   FROM automation_runs
   WHERE automation_id = 'xxx'
   ORDER BY created_at DESC;
   ```

2. **Common errors**
   - Missing `to_group_id` in move_group config
   - Invalid group_id (deleted or wrong company)
   - Missing `applicant_id` in payload
   - Webhook timeout or invalid URL

### Performance Issues

If automations slow down mutations:
1. Switch to async queue processing
2. Add indexes on `automation_runs(company_id, created_at)`
3. Archive old automation_runs (> 90 days)
4. Limit number of enabled automations per trigger

## API Reference

### Server Actions

```typescript
// List automations
const automations = await listAutomations(companyId);

// Create automation
const automation = await createAutomation(companyId, {
  name: "Auto-screen applicants",
  trigger_key: "form.submitted",
  filter: { job_id: "123" }, // optional
  actions: [
    { type: "move_group", config: { to_group_id: "abc" } },
    { type: "set_status", config: { status: "screening" } }
  ]
});

// Toggle automation
await toggleAutomation(companyId, automationId, false);

// Delete automation
await deleteAutomation(companyId, automationId);

// Test fire
await testFireAutomation(companyId, {
  trigger_key: "applicant.created",
  subject_type: "applicant",
  subject_id: "applicant-id",
  payload: {
    company_id: companyId,
    job_id: "job-id",
    applicant_id: "applicant-id"
  }
});

// Get run history
const runs = await getAutomationRuns(companyId, automationId, 50);
```

### Fire Trigger (Internal)

```typescript
import { fireTrigger } from '@/lib/automations/fire';

await fireTrigger(supabase, {
  companyId: "company-id",
  trigger_key: "applicant.status_changed",
  subject_type: "applicant",
  subject_id: "applicant-id",
  payload: {
    company_id: "company-id",
    job_id: "job-id",
    applicant_id: "applicant-id",
    old_status: "applied",
    new_status: "screening"
  }
});
```

## Success Criteria

✅ Database migration runs without errors
✅ Automation CRUD operations work via UI
✅ Triggers fire on real mutations (applicant move, status change, etc.)
✅ Actions execute successfully (move_group, set_status, webhook)
✅ Automation runs are logged with success/failure status
✅ RLS enforces company-level isolation
✅ Multi-action automations execute in order
✅ Failed actions stop execution and log errors
✅ Form submissions trigger automations
✅ TypeScript compiles without errors
✅ No hydration mismatches in UI
