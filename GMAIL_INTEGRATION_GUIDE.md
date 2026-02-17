# Gmail Integration - Per-User Setup Guide

## Overview

RouteFlex now supports **per-user Gmail integration** for automations, following Monday.com's UX patterns. Each user connects their own Gmail account and can use it in automations to send emails.

## Architecture

### Database
- **`gmail_connections`** table stores per-user OAuth credentials (encrypted)
- Each connection belongs to a specific user within an account
- Tokens are encrypted at rest and never sent to the browser

### OAuth Flow
- Server-side OAuth with CSRF protection using httpOnly cookies
- Automatic token refresh via Gmail API
- Scopes: `gmail.send`, `userinfo.email`, `userinfo.profile`

### Automation Action
- **Action type:** `send_email_gmail`
- **3-step configuration:** Choose account → Compose email → Select recipient
- **Variable support:** `{{applicant_name}}`, `{{job_title}}`, etc.

---

## Setup Instructions

### 1. Environment Variables

Add these to your `.env.local`:

```env
# Google OAuth Credentials
GOOGLE_OAUTH_CLIENT_ID=your_client_id_here
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret_here
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/integrations/gmail/callback-new

# Token Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
ENCRYPTION_KEY=your_base64_encryption_key_here

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Generate encryption key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 2. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Gmail API**
4. Create **OAuth 2.0 Client ID** credentials:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/integrations/gmail/callback-new`
   - For production: `https://yourdomain.com/api/integrations/gmail/callback-new`

5. Copy Client ID and Client Secret to `.env.local`

### 3. Run Database Migrations

```bash
# Apply migrations
supabase db push

# Or manually run:
# - 00044_gmail_integration.sql (adds action type constraints)
# - 00045_gmail_connections_per_user.sql (creates gmail_connections table)
```

---

## User Flow

### Connecting Gmail

1. User navigates to **Admin → Integrations** or clicks **"Integrate"** on Applicants board
2. Clicks **"Connect Gmail"**
3. Redirected to Google OAuth consent screen
4. Grants permissions for email sending
5. Redirected back with success message showing connected email

**Multiple accounts:** Users can connect multiple Gmail accounts

### Creating Email Automation

1. Go to Applicants board → **"Automate"**
2. Select trigger (e.g., "When applicant moves to group")
3. Add action → **"Send Email (Gmail)"**
4. Configure 3 steps:
   - **Choose account:** Select from your connected Gmail accounts
   - **Email:** Write subject/body with variable insertion
   - **Someone:** Select recipient from email-type board columns
5. Save automation

### Variables

Insert dynamic data using `{{variable_name}}` syntax:

- `{{applicant_name}}` - Full name of applicant
- `{{applicant_email}}` - Applicant's email
- `{{job_title}}` - Job title
- `{{company_name}}` - Company name
- `{{column_name}}` - Any board column (converted to snake_case)

**Example:**
```
Subject: Welcome to {{company_name}}, {{applicant_name}}!

Body:
Hi {{applicant_name}},

Thank you for applying to the {{job_title}} position.
We'll review your application and get back to you soon.

Best regards,
{{company_name}} Team
```

---

## File Structure

### Database
- `supabase/migrations/00045_gmail_connections_per_user.sql` - Gmail connections table + RLS

### API Routes
- `/api/integrations/gmail/start` - OAuth initiation with CSRF protection
- `/api/integrations/gmail/callback-new` - OAuth callback, token exchange
- `/api/integrations/gmail/connections` - List user's connections (no tokens)
- `/api/integrations/gmail/disconnect` - Revoke connection

### Components
- `src/components/integrations/GmailConnectionCard.tsx` - Connection display card
- `src/components/automations/SendEmailGmailAction.tsx` - Monday-style 3-step email action
- `src/app/admin/[accountId]/integrations/page-new.tsx` - Integrations UI page

### Libraries
- `src/lib/encryption.ts` - AES-256-GCM token encryption
- `src/lib/gmail-send.ts` - Gmail API client with auto-refresh
- `src/lib/automations/fireJobAutomation.ts` - Executor for `send_email_gmail` action

---

## Security Features

✅ **Tokens never sent to browser** - Only connection metadata (id, email) exposed
✅ **AES-256-GCM encryption** - Tokens encrypted at rest in database
✅ **CSRF protection** - State validation with httpOnly cookies
✅ **Automatic token refresh** - Handles expired access tokens transparently
✅ **RLS policies** - Users can only see/manage their own connections
✅ **Email validation** - Recipient emails validated before sending
✅ **PII logging protection** - Full email body not logged, only metadata

---

## Testing Checklist

### OAuth Flow
- [ ] Click "Connect Gmail" redirects to Google consent
- [ ] After granting permissions, redirects back with success toast
- [ ] Connected email appears in Integrations page
- [ ] Can disconnect Gmail account
- [ ] Can connect multiple Gmail accounts

### Automation Builder
- [ ] "Send Email (Gmail)" action appears in action list
- [ ] Shows connected Gmail accounts in dropdown
- [ ] "Connect Gmail" link works from automation builder
- [ ] Variable insertion menu shows board columns
- [ ] Recipient dropdown shows only email-type columns
- [ ] Validation prevents saving without required fields

### Runtime Execution
- [ ] Email sent when automation triggers
- [ ] Variables resolved correctly in subject/body
- [ ] Recipient email fetched from correct column
- [ ] Token refresh works when access token expires
- [ ] Automation run logs show success/failure
- [ ] Error handling for expired/revoked connections

---

## Troubleshooting

### "Gmail connection expired or revoked"
- User needs to reconnect their Gmail account
- Check that refresh_token is present in database
- Verify Google OAuth consent screen settings allow offline access

### "CSRF validation failed"
- Clear browser cookies
- Ensure `NEXT_PUBLIC_APP_URL` matches actual domain
- Check that cookies are enabled

### "No email columns found"
- Add an email-type column to the board:
  - Board settings → Add column → Type: Email

### Variables not resolving
- Check variable name matches column name (converted to snake_case)
- Ensure cell has a value for that applicant
- Use browser dev tools to inspect payload

---

## Monday.com UX Patterns Implemented

✅ 3-step action configuration (account → email → recipient)
✅ Dropdown overlays for selection (not modals)
✅ Inline variable chips with `{{variable}}` syntax
✅ Color-coded steps (blue for account, purple for recipient)
✅ Toast notifications for success/errors
✅ "Connect new" link directly from automation builder

---

## Production Deployment

Before deploying to production:

1. **Update redirect URI** in Google Cloud Console to production domain
2. **Set ENCRYPTION_KEY** in production environment (never commit to git)
3. **Use HTTPS** for all OAuth callbacks
4. **Test token refresh** by letting access token expire (1 hour)
5. **Monitor Gmail API quotas** - default is 1 billion quota units/day

---

## API Reference

### GET /api/integrations/gmail/start
**Query params:** `account_id`
**Response:** Redirects to Google OAuth

### GET /api/integrations/gmail/callback-new
**Query params:** `code`, `state`
**Response:** Redirects to integrations page with success/error

### GET /api/integrations/gmail/connections
**Query params:** `account_id`
**Response:** `{ connections: [{ id, email_address, created_at }] }`

### POST /api/integrations/gmail/disconnect
**Body:** `{ connectionId: uuid }`
**Response:** `{ success: true }`

---

## Future Enhancements

- [ ] Email templates library
- [ ] Rich text editor for email body
- [ ] Attachment support
- [ ] CC/BCC fields
- [ ] Email analytics (open/click tracking)
- [ ] Schedule send (delay email)
- [ ] A/B testing for subject lines

---

## Support

For issues or questions:
1. Check browser console for detailed error messages
2. Review automation run logs in database
3. Verify environment variables are set correctly
4. Test OAuth flow in incognito mode to rule out cookie issues
