# Automation Engine - File Reference

## Quick File Locations

### Database
- **Migration**: `supabase/migrations/00024_automation_engine.sql`
  - Creates all automation tables
  - Seeds trigger types
  - Sets up RLS policies

### Core Logic
- **Trigger Engine**: `src/lib/automations/fire.ts`
  - `fireTrigger()` - Main execution function
  - Filter matching logic
  - Action execution (move_group, set_status, webhook, send_email)

### Server Actions
- **Automation Management**: `src/app/dashboard/[companyId]/automations/actions.ts`
  - `listAutomations()`
  - `createAutomation()`
  - `toggleAutomation()`
  - `deleteAutomation()`
  - `testFireAutomation()`
  - `getAutomationRuns()`

### UI Components
- **Page**: `src/app/dashboard/[companyId]/automations/page.tsx`
  - Server component
  - Fetches automations, triggers, groups

- **Client**: `src/app/dashboard/[companyId]/automations/AutomationsClient.tsx`
  - List view
  - Create modal
  - Toggle/delete buttons

### Event Hooks (Wired)
- **Applicants**: `src/app/dashboard/[companyId]/applicants/actions.ts`
  - Lines with `fireTrigger()` calls:
    - `updateApplicantStatus()` - status_changed
    - `bulkMoveApplicants()` - moved_group
    - `moveApplicant()` - moved_group
    - `updateBoardCell()` - cell_updated
    - `createGroup()` - group.created
    - `createBoardColumn()` - column.created
    - `updateBoardColumn()` - column.renamed
    - `deleteBoardColumn()` - column.deleted

- **Forms**: `src/app/apply/[jobId]/[token]/actions.ts`
  - `submitApplication()` - form.submitted

## Database Tables

### automation_triggers
```sql
SELECT * FROM automation_triggers;
```
Catalog of all supported trigger types (seeded on migration).

### automations
```sql
SELECT * FROM automations WHERE company_id = 'xxx';
```
Company-owned automation rules.

### automation_actions
```sql
SELECT * FROM automation_actions WHERE automation_id = 'xxx' ORDER BY sort_order;
```
Actions attached to each automation (executed in sort_order).

### automation_runs
```sql
SELECT * FROM automation_runs WHERE company_id = 'xxx' ORDER BY created_at DESC LIMIT 20;
```
Execution history and logs.

### automation_queue
```sql
SELECT * FROM automation_queue WHERE status = 'queued';
```
Queue for future async processing (currently unused - executes inline).

## Quick Test Commands

### Apply Migration
```bash
npx supabase db reset --local
# or
npx supabase db push
```

### View Automations
```sql
-- List all automations
SELECT id, name, is_enabled, trigger_key FROM automations;

-- View automation with actions
SELECT
  a.id,
  a.name,
  a.trigger_key,
  a.is_enabled,
  json_agg(
    json_build_object(
      'type', aa.type,
      'config', aa.config,
      'sort_order', aa.sort_order
    ) ORDER BY aa.sort_order
  ) as actions
FROM automations a
LEFT JOIN automation_actions aa ON aa.automation_id = a.id
GROUP BY a.id;
```

### View Run History
```sql
-- Recent runs
SELECT
  ar.created_at,
  a.name as automation_name,
  ar.trigger_key,
  ar.status,
  ar.error,
  ar.payload
FROM automation_runs ar
LEFT JOIN automations a ON a.id = ar.automation_id
ORDER BY ar.created_at DESC
LIMIT 20;

-- Failed runs only
SELECT * FROM automation_runs
WHERE status = 'failed'
ORDER BY created_at DESC;
```

### Test in Browser Console
```javascript
// Create automation
const response = await fetch('/dashboard/[companyId]/automations/actions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: "Test Automation",
    trigger_key: "applicant.created",
    actions: [
      { type: "move_group", config: { to_group_id: "group-id-here" } }
    ]
  })
});
```

## Navigation in VS Code

Press `Cmd+P` (Mac) or `Ctrl+P` (Windows) and type:

- `fire.ts` → Trigger engine
- `00024_auto` → Migration
- `automations/actions` → Server actions
- `AutomationsClient` → UI component
- `applicants/actions` → Event hooks

## TypeScript Types

### Automation
```typescript
interface Automation {
  id: string;
  company_id: string;
  name: string;
  is_enabled: boolean;
  trigger_key: string;
  filter: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
```

### Action
```typescript
interface AutomationAction {
  id: string;
  automation_id: string;
  company_id: string;
  sort_order: number;
  type: 'move_group' | 'set_status' | 'webhook' | 'send_email';
  config: Record<string, any>;
  created_at: string;
}
```

### Run
```typescript
interface AutomationRun {
  id: string;
  company_id: string;
  automation_id: string | null;
  trigger_key: string;
  subject_type: string;
  subject_id: string;
  payload: Record<string, any>;
  status: 'success' | 'failed' | 'skipped';
  error: string | null;
  created_at: string;
}
```

## Common Patterns

### Adding a New Trigger

1. Add to `automation_triggers` seed in migration:
```sql
INSERT INTO automation_triggers (key, name, description, payload_schema) VALUES
  ('my.new_trigger', 'My New Trigger', 'Description', '{"company_id":"uuid"}'::jsonb);
```

2. Fire from server action:
```typescript
import { fireTrigger } from '@/lib/automations/fire';

await fireTrigger(supabase, {
  companyId,
  trigger_key: "my.new_trigger",
  subject_type: "subject_type",
  subject_id: "subject-id",
  payload: {
    company_id: companyId,
    // ... other data
  }
});
```

### Adding a New Action Type

1. Update constraint in migration:
```sql
ALTER TABLE automation_actions
DROP CONSTRAINT automation_actions_type_check;

ALTER TABLE automation_actions
ADD CONSTRAINT automation_actions_type_check
CHECK (type IN ('move_group', 'set_status', 'webhook', 'send_email', 'my_new_action'));
```

2. Add execution logic in `fire.ts`:
```typescript
case 'my_new_action':
  return executeMyNewAction(supabase, companyId, config, payload);
```

3. Add UI in `AutomationsClient.tsx`:
```typescript
{actionType === "my_new_action" && (
  <input /* config UI */ />
)}
```
