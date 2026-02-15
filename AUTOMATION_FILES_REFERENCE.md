# Job-Level Automation Engine - File Reference

## 📁 Files Created

### Database Migration
```
supabase/migrations/00025_job_level_automations.sql
```
- Drops old company-level automation tables
- Creates job-level automation schema
- Seeds 5 trigger types
- Adds RLS policies with helper functions
- Adds validation triggers

### Core Engine
```
src/lib/automations/fireJobAutomation.ts
```
- `fireJobTrigger()` - Main execution function
- Filter matching logic
- Action executors (move_group, set_status, webhook, send_email)
- Infinite loop prevention

### Server Actions
```
src/app/dashboard/[companyId]/jobs/[jobId]/automations/actions.ts
```
- `listJobAutomations()`
- `createJobAutomation()`
- `toggleJobAutomation()`
- `deleteJobAutomation()`
- `listJobAutomationRuns()`
- `testFireJobAutomation()`
- `getJobGroups()`
- `getAutomationTriggers()`

### UI Components
```
src/components/automations/AutomationOverlay.tsx
src/components/automations/ManageTab.tsx
src/components/automations/CreateTab.tsx
src/app/dashboard/[companyId]/jobs/[jobId]/applicants/AutomateButton.tsx
```
- Monday.com-style overlay
- Two tabs: Manage & Create
- Searchable trigger dropdown
- Recipe builder with live preview
- Contextual action config

---

## 📝 Files Modified

### Job Board Integration
```
src/app/dashboard/[companyId]/jobs/[jobId]/applicants/page.tsx
```
**Changes**:
- Import `AutomateButton`
- Fetch automations, triggers, groups
- Add "Automate" button to navigation
- Pass data to button component

### Event Hooks
```
src/app/dashboard/[companyId]/applicants/actions.ts
```
**Changes**:
- Import `fireJobTrigger` (replaced `fireTrigger`)
- Update all trigger calls to include `jobId`
- Fire `applicant.status_changed`
- Fire `applicant.moved_group`
- Fire `board.column_changed`
- Fire `group.created`
- Fire `column.created`
- Fire `column.renamed`
- Fire `column.deleted`

```
src/app/apply/[jobId]/[token]/actions.ts
```
**Changes**:
- Import `fireJobTrigger` (replaced `fireTrigger`)
- Fire `form.submitted` on form submission
- Fire `applicant.created` on form submission

---

## 📚 Documentation Files
```
JOB_LEVEL_AUTOMATIONS_SUMMARY.md    - Complete implementation overview
JOB_LEVEL_AUTOMATIONS_TESTING.md    - Step-by-step testing guide
AUTOMATION_FILES_REFERENCE.md       - This file
```

---

## 🗂️ Directory Structure

```
ark-recruiting-saas/
├── supabase/
│   └── migrations/
│       └── 00025_job_level_automations.sql         ← NEW
│
├── src/
│   ├── lib/
│   │   └── automations/
│   │       └── fireJobAutomation.ts               ← NEW
│   │
│   ├── components/
│   │   └── automations/
│   │       ├── AutomationOverlay.tsx              ← NEW
│   │       ├── ManageTab.tsx                      ← NEW
│   │       └── CreateTab.tsx                      ← NEW
│   │
│   └── app/
│       ├── dashboard/
│       │   └── [companyId]/
│       │       ├── applicants/
│       │       │   └── actions.ts                 ← MODIFIED
│       │       │
│       │       └── jobs/
│       │           └── [jobId]/
│       │               ├── automations/
│       │               │   └── actions.ts         ← NEW
│       │               │
│       │               └── applicants/
│       │                   ├── page.tsx           ← MODIFIED
│       │                   └── AutomateButton.tsx ← NEW
│       │
│       └── apply/
│           └── [jobId]/
│               └── [token]/
│                   └── actions.ts                 ← MODIFIED
│
└── docs/
    ├── JOB_LEVEL_AUTOMATIONS_SUMMARY.md           ← NEW
    ├── JOB_LEVEL_AUTOMATIONS_TESTING.md           ← NEW
    └── AUTOMATION_FILES_REFERENCE.md              ← NEW
```

---

## 🔍 Quick File Lookup

### Need to...

**Add a new trigger type?**
→ Edit `supabase/migrations/00025_job_level_automations.sql` (trigger seeds)

**Add a new action type?**
→ Edit `src/lib/automations/fireJobAutomation.ts` (add case in executeAction)
→ Edit `src/components/automations/CreateTab.tsx` (add UI for config)

**Fire a trigger from a new action?**
→ Import `fireJobTrigger` in your actions.ts file
→ Call after successful mutation with jobId + payload

**Customize overlay UI?**
→ Edit `src/components/automations/AutomationOverlay.tsx`
→ Edit `src/components/automations/ManageTab.tsx` (list view)
→ Edit `src/components/automations/CreateTab.tsx` (recipe builder)

**Change button appearance?**
→ Edit `src/app/dashboard/[companyId]/jobs/[jobId]/applicants/AutomateButton.tsx`

**Debug automation execution?**
→ Check `src/lib/automations/fireJobAutomation.ts` console logs
→ Query `automation_runs` table for error messages

**Modify server actions?**
→ Edit `src/app/dashboard/[companyId]/jobs/[jobId]/automations/actions.ts`

---

## 🎯 Key Functions to Know

### Trigger Execution
```typescript
// src/lib/automations/fireJobAutomation.ts
await fireJobTrigger(supabase, {
  companyId: string,
  jobId: string,
  trigger_key: string,
  subject_type: string,
  subject_id: string,
  payload: Record<string, any>
});
```

### Create Automation
```typescript
// src/app/dashboard/[companyId]/jobs/[jobId]/automations/actions.ts
await createJobAutomation(companyId, jobId, {
  name: string,
  trigger_key: string,
  filter?: Record<string, any>,
  actions: Array<{
    type: 'move_group' | 'set_status' | 'webhook' | 'send_email',
    config: Record<string, any>,
    sort_order?: number
  }>
});
```

### List Automations
```typescript
const automations = await listJobAutomations(companyId, jobId);
```

### Toggle Automation
```typescript
await toggleJobAutomation(companyId, jobId, automationId, is_enabled);
```

---

## 🛠️ Common Tasks

### Add a Custom Trigger

1. **Add to migration** (`00025_job_level_automations.sql`):
```sql
insert into automation_triggers (key, name, description, payload_schema) values
  ('custom.trigger', 'Custom Event', 'When something custom happens', '{"job_id":"uuid"}'::jsonb)
on conflict (key) do nothing;
```

2. **Fire from action** (e.g., `applicants/actions.ts`):
```typescript
await fireJobTrigger(supabase, {
  companyId,
  jobId,
  trigger_key: "custom.trigger",
  subject_type: "custom",
  subject_id: "id",
  payload: { company_id: companyId, job_id: jobId }
});
```

### Add a Custom Action

1. **Update migration constraint** (`00025_job_level_automations.sql`):
```sql
alter table automation_actions
  drop constraint automation_actions_type_check;

alter table automation_actions
  add constraint automation_actions_type_check
  check (type in ('move_group', 'set_status', 'webhook', 'send_email', 'my_action'));
```

2. **Add executor** (`fireJobAutomation.ts`):
```typescript
case 'my_action':
  return executeMyAction(supabase, companyId, jobId, config, payload);
```

3. **Add UI** (`CreateTab.tsx`):
```typescript
{action.type === "my_action" && (
  <input /* config UI */ />
)}
```

---

## 📊 Database Tables Quick Ref

```sql
-- All automations for a job
SELECT * FROM automations WHERE job_id = 'xxx';

-- All actions for an automation
SELECT * FROM automation_actions WHERE automation_id = 'xxx' ORDER BY sort_order;

-- Recent runs
SELECT * FROM automation_runs WHERE job_id = 'xxx' ORDER BY created_at DESC LIMIT 20;

-- Failed runs
SELECT * FROM automation_runs WHERE job_id = 'xxx' AND status = 'failed';

-- Trigger catalog
SELECT * FROM automation_triggers ORDER BY key;
```

---

## ✅ Checklist for Deployment

- [ ] Apply migration: `npx supabase db push`
- [ ] Verify TypeScript compiles: `npx tsc --noEmit`
- [ ] Test create automation via overlay
- [ ] Test form submission triggers automation
- [ ] Test manual actions trigger automations
- [ ] Verify automation runs logged
- [ ] Test toggle enable/disable
- [ ] Test delete automation
- [ ] Check browser console for errors
- [ ] Verify no hydration mismatches
- [ ] Test RLS (different users/companies)

---

**Total Files**: 11 (3 modified, 8 new)
**Total Lines**: ~3,500 lines of code + SQL + docs
