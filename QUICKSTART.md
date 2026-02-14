# Quick Start Guide

## 🎯 What You Got

A complete **Monday.com-style multi-tenant account system** with:
- Action-based billing (3,000 actions/month for basic plan)
- Near-real-time automations (status change triggers)
- Admin Center for usage monitoring and team management
- Full RBAC (Admin, Member, Viewer roles)

## ⚡ Get Started (5 minutes)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Run Database Migrations

**Option A: Supabase Dashboard** (recommended if no CLI)
1. Open https://supabase.com/dashboard/project/YOUR_PROJECT/sql
2. Copy/paste each migration file in order:
   - `supabase/migrations/00011_accounts.sql`
   - `supabase/migrations/00012_companies_account_backfill.sql`
   - `supabase/migrations/00013_action_metering.sql`
   - `supabase/migrations/00014_automations.sql`
   - `supabase/migrations/00015_integrations.sql`
3. Run each one (click "Run")

**Option B: Supabase CLI**
```bash
supabase db push
```

### Step 3: Find Your Account ID
Run this in Supabase SQL Editor:
```sql
SELECT id, name FROM accounts;
```

### Step 4: Visit Admin Center
```
http://localhost:3000/admin/{your-account-id}
```

You should see:
- ✅ Overview with quota meter
- ✅ Team members (users page)
- ✅ Placeholder automation and integration pages

## 🧪 Test Automations

### Quick Test: Move Applicant When Status Changes

1. **Insert a test automation rule** (Supabase SQL Editor):

```sql
-- Get your IDs first
SELECT
  a.id as account_id,
  c.id as company_id,
  b.id as board_id,
  bc.id as status_column_id,
  bsl.id as status_label_id,
  bsl.label,
  bg.id as group_id,
  bg.name as group_name
FROM accounts a
JOIN companies c ON c.account_id = a.id
JOIN boards b ON b.company_id = c.id
JOIN board_columns bc ON bc.board_id = b.id AND bc.type = 'status'
JOIN board_status_labels bsl ON bsl.column_id = bc.id
CROSS JOIN board_groups bg
WHERE bg.company_id = c.id
LIMIT 10;

-- Create automation rule (use IDs from above)
INSERT INTO automation_rules (
  account_id, company_id, board_id, name,
  trigger_column_id, trigger_to_status_label_id,
  created_by, is_enabled
) VALUES (
  '{account-id}',
  '{company-id}',
  '{board-id}',
  'Auto-move to Interview group',
  '{status-column-id}',
  '{interview-status-label-id}',  -- Pick a status from results above
  '{your-user-id}',
  true
) RETURNING id;

-- Add "move to group" action (use rule ID from above)
INSERT INTO automation_actions (rule_id, action_type, config)
VALUES (
  '{rule-id-from-above}',
  'move_to_group',
  jsonb_build_object('target_group_id', '{some-group-id}')
);
```

2. **Trigger the automation**:
   - Go to your Applicants board
   - Change an applicant's status to the trigger status (e.g., "Interview")
   - The applicant should automatically move to the target group

3. **Verify it worked**:
```sql
-- Check event was created
SELECT * FROM status_change_events ORDER BY occurred_at DESC LIMIT 5;

-- Check action ran successfully
SELECT * FROM automation_action_runs ORDER BY created_at DESC LIMIT 5;

-- Check quota was incremented
SELECT used_units, quota_units FROM account_action_periods
WHERE account_id = '{your-account-id}';
```

4. **Check Admin Center**:
   - Go to `/admin/{account-id}`
   - "Actions Used" should show 1
   - "Actions Remaining" should show 2,999

## 📖 Full Documentation

- **`IMPLEMENTATION_SUMMARY.md`** - What was built, architecture, troubleshooting
- **`IMPLEMENTATION_GUIDE.md`** - Detailed setup, testing, and debugging

## ❓ Common Issues

**"Account not found"**
- Run migrations in order (especially 00012 which backfills accounts)

**"Automations not triggering"**
- Check browser console for dispatch errors
- Verify rule is `is_enabled = true`
- Check quota not exceeded

**"Can't access admin center"**
- Verify your user has `role = 'admin'` in `account_memberships`

## 🚀 What's Next?

The system is production-ready for the "move to group" automation. To enable other actions:

1. **Gmail**: Complete OAuth flow in `src/app/api/integrations/gmail/callback/route.ts`
2. **SMS**: Add Twilio API calls in `src/lib/automations/executors.ts`
3. **Slack**: Add webhook posting in executors
4. **UI for rules**: Build automation rule builder (currently SQL only)

## 💬 Need Help?

Check the troubleshooting sections in:
- `IMPLEMENTATION_GUIDE.md`
- `IMPLEMENTATION_SUMMARY.md`

Happy automating! 🎉
