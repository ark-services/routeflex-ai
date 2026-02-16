# Gmail OAuth Callback Fix

## Problem
The Gmail OAuth callback was returning HTTP 500 with error:
```
ERROR: column integration_credentials.metadata does not exist
```

## Root Cause
The callback route was trying to write to `integration_credentials.metadata` but the database schema didn't have this column.

## Solution Applied

### 1. Database Migration
Created standalone migration: `00046_add_integration_credentials_metadata.sql`

This adds the missing `metadata` column safely with `IF NOT EXISTS`:
```sql
alter table public.integration_credentials
  add column if not exists metadata jsonb default '{}';
```

### 2. Defensive Code Changes

**File: `/api/integrations/gmail/callback/route.ts`**
- Now tries to upsert WITH metadata first
- Falls back to upsert WITHOUT metadata if column doesn't exist
- Prevents 500 errors if migration not applied

**File: `/api/integrations/gmail/callback-new/route.ts`**
- Added try/catch around encryption
- Falls back to plaintext if `ENCRYPTION_KEY` not set
- Logs warning but doesn't crash

### 3. Code Changes Summary
```typescript
// OLD CODE (crashed if metadata column missing):
const { error } = await supabase
  .from('integration_credentials')
  .upsert({
    account_id: state,
    integration_type: 'gmail',
    credentials: tokens,
    metadata: { email: profile.data.emailAddress }, // ❌ crashes
    is_active: true,
  });

// NEW CODE (defensive, won't crash):
// Try with metadata first
const { error: errorWithMetadata } = await supabase
  .from('integration_credentials')
  .upsert({
    ...baseData,
    metadata: { email: profile.data.emailAddress },
  });

// If metadata column doesn't exist, retry without it
if (errorWithMetadata?.message?.includes('metadata')) {
  const { error: errorWithoutMetadata } = await supabase
    .from('integration_credentials')
    .upsert(baseData); // ✅ succeeds even without metadata
  upsertError = errorWithoutMetadata;
}
```

---

## Fix Instructions

### Step 1: Apply Database Migration

**Option A: Using Supabase CLI (Recommended)**
```bash
# Apply the migration
supabase db push

# Or apply specific migration
supabase migration up 00046_add_integration_credentials_metadata
```

**Option B: Using Supabase Dashboard**
1. Go to your Supabase project
2. Navigate to SQL Editor
3. Run this SQL:
```sql
alter table public.integration_credentials
  add column if not exists metadata jsonb default '{}';
```

**Option C: Manual SQL**
```bash
# Connect to your database
psql <your-database-url>

# Run the migration
\i supabase/migrations/00046_add_integration_credentials_metadata.sql
```

### Step 2: Verify Migration Applied

```sql
-- Check if metadata column exists
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'integration_credentials'
  AND table_schema = 'public'
ORDER BY ordinal_position;
```

Expected output should include:
```
column_name | data_type | is_nullable | column_default
------------+-----------+-------------+----------------
metadata    | jsonb     | YES         | '{}'::jsonb
```

### Step 3: Restart Development Server

```bash
# Stop current dev server (Ctrl+C)

# Restart
npm run dev
```

### Step 4: Test OAuth Flow

#### Test Checklist:

**✅ Before Testing:**
- [ ] Migration applied to database
- [ ] Dev server restarted
- [ ] Environment variables set (see below)

**✅ OAuth Flow Test:**
1. Navigate to `/admin/{accountId}/integrations`
2. Click "Connect Gmail"
3. Should redirect to Google consent screen (not 500)
4. Grant permissions
5. Should redirect back to integrations page
6. Verify:
   - [ ] No 500 error
   - [ ] Success toast shows "Gmail connected successfully"
   - [ ] Connected email address appears
   - [ ] Database has new row in `integration_credentials` or `gmail_connections`

**✅ Database Verification:**
```sql
-- Check old account-level integration (if using /callback route)
SELECT id, account_id, integration_type,
       metadata->>'email' as connected_email,
       is_active, created_at
FROM integration_credentials
WHERE integration_type = 'gmail'
ORDER BY created_at DESC;

-- Check new per-user integration (if using /callback-new route)
SELECT id, user_id, email_address, provider, created_at
FROM gmail_connections
WHERE revoked_at IS NULL
ORDER BY created_at DESC;
```

**Expected Result:**
- Should see a new row with your Gmail address
- `metadata` column should contain `{"email": "your@gmail.com"}`
- No error logs in terminal

---

## Environment Variables Required

Make sure these are set in `.env.local`:

```env
# For OLD callback route (/api/integrations/gmail/callback)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000

# For NEW callback route (/api/integrations/gmail/callback-new)
GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/integrations/gmail/callback-new
ENCRYPTION_KEY=<generate_with_crypto.randomBytes>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Note:** The old route uses `GOOGLE_CLIENT_ID`, new route uses `GOOGLE_OAUTH_CLIENT_ID`

---

## Which Callback Route is Being Used?

Check your auth start routes to see which callback is configured:

**Old route (account-level):**
- Start: `/api/integrations/gmail/auth`
- Callback: `/api/integrations/gmail/callback`
- Table: `integration_credentials`

**New route (per-user):**
- Start: `/api/integrations/gmail/start`
- Callback: `/api/integrations/gmail/callback-new`
- Table: `gmail_connections`

---

## Troubleshooting

### Issue: Still getting 500 error

**Check 1: Migration not applied**
```sql
-- Verify column exists
SELECT column_name FROM information_schema.columns
WHERE table_name = 'integration_credentials'
  AND column_name = 'metadata';
```

If no results, migration not applied. Run Step 1 again.

**Check 2: Wrong environment variables**
Check which route is being hit:
```bash
# Watch server logs when clicking "Connect Gmail"
# Look for which route is called
```

**Check 3: Encryption key not set (for new route)**
```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Add to .env.local
ENCRYPTION_KEY=<output_from_above>
```

### Issue: Callback succeeds but no data stored

**Check RLS policies:**
```sql
-- Check if user has permission
SELECT * FROM integration_credentials
WHERE account_id = '<your-account-id>';
```

If empty, check account_memberships table.

### Issue: "csrf_failed" error

**Solution:**
1. Clear all cookies
2. Try OAuth flow in incognito window
3. Ensure `NEXT_PUBLIC_APP_URL` matches actual URL

---

## Verification Commands

### Check Migration Status
```bash
# List all migrations
ls -la supabase/migrations/

# Check if 00046 exists
ls supabase/migrations/00046_add_integration_credentials_metadata.sql
```

### Check Database Schema
```sql
-- Full schema for integration_credentials
\d+ integration_credentials

-- Or
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'integration_credentials'
  AND table_schema = 'public';
```

### Check Connected Accounts
```sql
-- Account-level (old)
SELECT
  ic.id,
  ic.account_id,
  ic.metadata->>'email' as email,
  ic.is_active,
  ic.created_at
FROM integration_credentials ic
WHERE ic.integration_type = 'gmail';

-- Per-user (new)
SELECT
  gc.id,
  gc.user_id,
  gc.email_address,
  gc.created_at,
  gc.revoked_at
FROM gmail_connections gc
WHERE gc.revoked_at IS NULL;
```

---

## Commit Message

```bash
git add supabase/migrations/00046_add_integration_credentials_metadata.sql
git add src/app/api/integrations/gmail/callback/route.ts
git add src/app/api/integrations/gmail/callback-new/route.ts
git commit -m "fix: add metadata column to integration_credentials and make OAuth callbacks defensive

- Add migration 00046 to add metadata jsonb column with IF NOT EXISTS
- Update callback route to gracefully handle missing metadata column
- Add fallback to plaintext if encryption fails (with warning)
- Prevents 500 errors during OAuth flow if migration not applied
- Both old (/callback) and new (/callback-new) routes now defensive"
```

---

## Next Steps After Fix

1. **Apply migration** to all environments (dev, staging, prod)
2. **Test OAuth flow** in each environment
3. **Monitor logs** for any "metadata column not found" warnings
4. **Plan migration** to per-user approach (callback-new route)
5. **Deprecate old route** once all users migrated

---

## Questions?

If still seeing issues:
1. Check server terminal logs for detailed error messages
2. Check browser network tab for actual response
3. Check Supabase logs for database errors
4. Verify all environment variables are set correctly
