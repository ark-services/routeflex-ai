# Account + Admin Center + Automations Implementation Guide

This guide explains how to deploy the multi-tenant account system with action-based billing and automations.

## Overview

The implementation adds:
- **Account hierarchy**: Account → Companies → Jobs → Applicants (multi-tenant billing)
- **Role-based access control**: Admin, Member, Viewer roles
- **Seat limits**: Basic plan = 1 seat (upgradable)
- **Action metering**: Track automation actions with monthly quotas (3,000/month for basic plan)
- **Automations**: Status change triggers with actions (Gmail, SMS, Slack, move to group)
- **Near-real-time dispatch**: Execute automations within seconds

## Step 1: Install Dependencies

```bash
npm install
```

New dependencies added:
- `googleapis` - For Gmail integration (OAuth + API)
- `twilio` - For SMS integration

## Step 2: Run Database Migrations

The migrations must be run **in order**. You can run them via:

### Option A: Supabase Dashboard (Recommended if no CLI)

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste each migration file in order:
   - `supabase/migrations/00011_accounts.sql`
   - `supabase/migrations/00012_companies_account_backfill.sql`
   - `supabase/migrations/00013_action_metering.sql`
   - `supabase/migrations/00014_automations.sql`
   - `supabase/migrations/00015_integrations.sql`
4. Execute each migration

### Option B: Supabase CLI

If you have the Supabase CLI installed:

```bash
supabase db push
```

## Step 3: Verify Migration Success

After running migrations, verify in the Supabase dashboard:

1. **Check Tables Created**:
   - `accounts`, `account_memberships`, `account_invites`
   - `account_action_ledger`, `account_action_periods`
   - `status_change_events`, `automation_rules`, `automation_actions`, `automation_action_runs`
   - `integration_credentials`

2. **Verify Backfill**:
   - Run this query to check accounts were created:
     ```sql
     SELECT a.id, a.name, c.id as company_id, c.name as company_name
     FROM accounts a
     JOIN companies c ON c.account_id = a.id;
     ```
   - All existing companies should have an `account_id` set
   - All existing company members should have corresponding `account_memberships` rows

3. **Test RLS Policies**:
   - Log in as a user
   - Verify you can only see your own account data

## Step 4: Environment Variables

Add these to your `.env.local` file:

```bash
# Gmail OAuth (for automation integrations)
GMAIL_CLIENT_ID=your-google-oauth-client-id
GMAIL_CLIENT_SECRET=your-google-oauth-secret

# Twilio (for SMS automation)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token

# App URL (for automation callbacks)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Note**: Gmail and Twilio integrations are scaffolded but not fully implemented. You can skip these for now.

## Step 5: Access Admin Center

After migrations are complete:

1. Find your account ID:
   ```sql
   SELECT id, name FROM accounts WHERE name = 'Your Company Name';
   ```

2. Navigate to: `http://localhost:3000/admin/{accountId}`

3. You should see:
   - **Overview**: Action quota meter, automation count
   - **Users**: Team member management, invitations
   - **Automations**: Rule management (placeholder)
   - **Integrations**: Gmail, Twilio, Slack setup (placeholder)

## Step 6: Test Automations

### Create a Test Automation Rule

1. Insert a test automation rule directly in the database:

```sql
-- Get your account and company IDs
SELECT a.id as account_id, c.id as company_id, b.id as board_id
FROM accounts a
JOIN companies c ON c.account_id = a.id
JOIN boards b ON b.company_id = c.id
WHERE a.name = 'Your Company Name' LIMIT 1;

-- Get a status column and labels
SELECT c.id as column_id, sl.id as status_label_id, sl.label
FROM board_columns c
JOIN board_status_labels sl ON sl.column_id = c.id
WHERE c.type = 'status' AND c.company_id = '{your-company-id}'
ORDER BY c.created_at, sl.sort_order;

-- Create an automation rule
INSERT INTO automation_rules (
  account_id, company_id, board_id, name, is_enabled,
  trigger_type, trigger_column_id, trigger_to_status_label_id,
  created_by
) VALUES (
  '{account-id}', '{company-id}', '{board-id}',
  'Test Move to Group',
  true,
  'status_change',
  '{status-column-id}',
  '{target-status-label-id}', -- e.g., "Interview" status
  '{your-user-id}'
) RETURNING id;

-- Add a "move to group" action
INSERT INTO automation_actions (rule_id, action_type, sort_order, config)
VALUES (
  '{rule-id-from-above}',
  'move_to_group',
  1,
  '{"target_group_id": "{some-group-id}"}'
);
```

2. Update an applicant's status in the UI to the trigger status
3. Verify in the database:
   ```sql
   -- Check event was created
   SELECT * FROM status_change_events ORDER BY occurred_at DESC LIMIT 5;

   -- Check action ran
   SELECT * FROM automation_action_runs ORDER BY created_at DESC LIMIT 5;

   -- Check quota was incremented
   SELECT * FROM account_action_periods WHERE account_id = '{account-id}';
   ```

## Architecture

### Data Flow

1. **Status Change** → `updateBoardCell()` action detects status column change
2. **Event Creation** → Dispatcher creates `status_change_events` row
3. **Rule Matching** → Finds matching `automation_rules` with actions
4. **Quota Check** → Verifies account quota not exceeded
5. **Action Execution** → Runs executors (Gmail, SMS, Slack, move)
6. **Metering** → Records usage in `account_action_ledger` + increments `account_action_periods`

### Key Tables

- **accounts**: Billing entity, plan type, seat limits
- **account_memberships**: User roles per account (admin/member/viewer)
- **account_action_periods**: Monthly quota tracking
- **account_action_ledger**: Append-only audit trail of all actions
- **automation_rules**: Trigger conditions (status change)
- **automation_actions**: Actions to execute (Gmail, SMS, Slack, move)
- **automation_action_runs**: Execution history with idempotency

### RBAC Enforcement

- **Admin**: Full control, manage users, integrations, view all data
- **Member**: Edit boards, create automations, view data
- **Viewer**: Read-only access

Check role in server actions:
```typescript
import { requireAdmin, requireMemberOrAbove } from '@/lib/rbac';

export async function someAdminAction(accountId: string) {
  const membership = await requireAdmin(accountId); // Redirects if not admin
  // ... admin-only logic
}
```

## What's Implemented

✅ Database schema and migrations
✅ Account creation and backfill from existing companies
✅ RBAC helpers and enforcement
✅ Admin Center UI (overview, users, automations placeholder, integrations placeholder)
✅ Action metering infrastructure (ledger + periods)
✅ Quota tracking and enforcement
✅ Automation dispatcher (near-real-time status change detection)
✅ Action executors (move_to_group working, others scaffolded)
✅ Status change event tracking
✅ Idempotent action execution

## What's Not Implemented (Future Work)

❌ Gmail OAuth flow and email sending
❌ Twilio SMS sending
❌ Slack webhook integration
❌ Automation rule creation UI
❌ Automation run history UI
❌ User invitation flow (email sending)
❌ Seat upgrade flow
❌ Monthly period reset cron job
❌ Overage notifications

## Troubleshooting

### "Account not found" error
- Verify migrations ran successfully
- Check `companies.account_id` is not null
- Run backfill migration again if needed

### Automations not triggering
- Check browser console for dispatch errors
- Verify `NEXT_PUBLIC_SUPABASE_URL` is set
- Check `status_change_events` table for events
- Verify automation rule is `is_enabled = true`
- Check quota not exceeded in `account_action_periods`

### Admin center access denied
- Verify user has `role = 'admin'` in `account_memberships`
- Check RLS policies are enabled
- Verify accountId in URL matches user's account

### Quota not incrementing
- Check `record_action_usage()` function exists
- Verify `account_action_periods` row created for current period
- Check `account_action_ledger` for completed actions

## Next Steps

1. **Build automation rule UI**: Allow users to create/edit rules via UI
2. **Implement Gmail integration**: Complete OAuth flow and send emails
3. **Add Twilio/Slack**: Finish SMS and Slack integrations
4. **Create monthly reset job**: Cron to reset quotas and handle carryover debt
5. **Add usage alerts**: Email notifications at 80%, 100% quota
6. **Build upgrade flow**: UI to increase seats and quotas

## Support

For issues or questions, check:
- Migration files for SQL errors
- Browser console for API errors
- Supabase logs for RPC function errors
- Database tables for missing data
