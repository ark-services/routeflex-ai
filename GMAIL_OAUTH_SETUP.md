# Gmail OAuth Setup Guide

## Overview

This application uses Gmail OAuth to send automated emails. The OAuth flow is implemented with proper security, validation, and error handling.

## Canonical OAuth Flow

**Single, consistent flow across all environments:**

```
User clicks "Connect Gmail"
  ↓
/api/integrations/gmail/start
  ↓
Google OAuth Consent Screen
  ↓
/api/integrations/gmail/callback-new
  ↓
Success: Redirects to /admin/{accountId}/integrations?success=gmail_connected
```

## Required Environment Variables

### Production & Development

```bash
# Google OAuth Client Credentials
GOOGLE_OAUTH_CLIENT_ID=<your_client_id>.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=<your_client_secret>

# OAuth Callback URL (must match Google Console exactly)
GOOGLE_OAUTH_REDIRECT_URI=https://your-app.com/api/integrations/gmail/callback-new

# Encryption Key (required in production, recommended in dev)
ENCRYPTION_KEY=<base64_encoded_256bit_key>
```

### Example Values

**Local Development:**
```bash
GOOGLE_OAUTH_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-abc123def456
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/integrations/gmail/callback-new
ENCRYPTION_KEY=<generate_with_crypto.randomBytes>
```

**Production:**
```bash
GOOGLE_OAUTH_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-abc123def456
GOOGLE_OAUTH_REDIRECT_URI=https://app.yourcompany.com/api/integrations/gmail/callback-new
ENCRYPTION_KEY=<generate_with_crypto.randomBytes>
```

## Google Cloud Console Setup

### 1. Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Name: `Gmail Integration - Production` (or Dev/Staging)

### 2. Configure Authorized Redirect URIs

Add the callback URL for each environment:

**Development:**
```
http://localhost:3000/api/integrations/gmail/callback-new
```

**Vercel Preview:**
```
https://<your-app>-<hash>.vercel.app/api/integrations/gmail/callback-new
```

**Production:**
```
https://app.yourcompany.com/api/integrations/gmail/callback-new
```

⚠️ **CRITICAL**: The redirect URI must match **exactly** (including protocol, domain, path, and trailing slash).

### 3. Enable Required APIs

Enable these APIs in Google Cloud Console:

- Gmail API
- Google+ API (for userinfo)

### 4. Configure OAuth Consent Screen

1. Navigate to **OAuth consent screen**
2. User Type: **External** (unless using Google Workspace)
3. App name: Your application name
4. User support email: Your email
5. Developer contact: Your email
6. Scopes:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`

## Environment Setup

### Development (.env.local)

```bash
# Copy .env.example to .env.local
cp .env.example .env.local

# Add OAuth credentials
GOOGLE_OAUTH_CLIENT_ID=<from_google_console>
GOOGLE_OAUTH_CLIENT_SECRET=<from_google_console>
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/integrations/gmail/callback-new

# Generate encryption key
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
```

### Production (Vercel/etc)

Add environment variables via your deployment platform:

```bash
# Vercel CLI
vercel env add GOOGLE_OAUTH_CLIENT_ID
vercel env add GOOGLE_OAUTH_CLIENT_SECRET
vercel env add GOOGLE_OAUTH_REDIRECT_URI
vercel env add ENCRYPTION_KEY

# Or via Vercel Dashboard:
# Settings → Environment Variables → Add New
```

## Validation & Testing

### 1. Verify Environment Variables

```bash
# Check if all required vars are set
curl http://localhost:3000/api/admin/verify-encryption

# Expected response:
{
  "available": true,
  "verified": true,
  "message": "Encryption is configured correctly and working"
}
```

### 2. Test OAuth Flow

1. Start development server: `npm run dev`
2. Navigate to: `http://localhost:3000/admin/{accountId}/integrations`
3. Click "Connect Gmail"
4. Check server logs for:
   ```
   [Gmail OAuth Start] Configuration validated:
     Client ID: 123456789.apps.goo...
     Redirect URI: http://localhost:3000/api/integrations/gmail/callback-new
   [Gmail OAuth Start] ✅ Redirecting to Google OAuth for account: <accountId>
   ```
5. Complete Google OAuth consent
6. Verify success redirect and toast message

### 3. Check for Common Errors

**Error: "Missing required parameter: client_id"**
- Cause: `GOOGLE_OAUTH_CLIENT_ID` not set or undefined
- Fix: Set environment variable and restart server

**Error: "redirect_uri_mismatch"**
- Cause: `GOOGLE_OAUTH_REDIRECT_URI` doesn't match Google Console
- Fix: Update Google Console or environment variable to match exactly

**Error: "Invalid URL: undefined/admin/..."**
- Cause: Old code using `NEXT_PUBLIC_APP_URL` instead of request origin
- Fix: Update to latest version (uses `request.nextUrl.origin`)

## Troubleshooting

### Missing Environment Variables

If OAuth fails immediately, check server logs:

```
[Gmail OAuth Start] ❌ Missing required environment variables: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_REDIRECT_URI
[Gmail OAuth Start]    This will cause "Missing required parameter" errors from Google
[Gmail OAuth Start]    Set these in your .env.local or deployment environment
```

**Fix:**
1. Check `.env.local` exists and has all required variables
2. Restart development server: `npm run dev`
3. Verify variables are loaded: Check startup logs

### Redirect URI Mismatch

```
Error: redirect_uri_mismatch
The redirect URI in the request: http://localhost:3000/api/integrations/gmail/callback-new
does not match the ones authorized for the OAuth client.
```

**Fix:**
1. Go to Google Cloud Console → Credentials
2. Edit your OAuth 2.0 Client ID
3. Add the exact redirect URI from the error message
4. Save and retry

### Token Exchange Fails

```
[OAuth callback-new] ❌ Token exchange failed
  Status: 400 Bad Request
  Response: invalid_grant
```

**Common causes:**
- Authorization code already used (codes are single-use)
- Code expired (10 minute lifetime)
- Redirect URI mismatch between start and callback
- Clock skew on server

**Fix:**
1. Verify `GOOGLE_OAUTH_REDIRECT_URI` is identical in both start and callback
2. Retry OAuth flow (generates new code)
3. Check server time is accurate

### Encryption Fails

```
[OAuth callback-new] ❌ Encryption failed: ENCRYPTION_KEY not set in development
⚠️ SECURITY WARNING: Storing tokens in PLAINTEXT (development only)
```

**Fix (Development):**
```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Add to .env.local
echo "ENCRYPTION_KEY=<generated_key>" >> .env.local

# Restart server
npm run dev
```

**Fix (Production):**
- Add `ENCRYPTION_KEY` to deployment environment
- Redeploy application
- OAuth will fail hard in production without encryption key (security feature)

## Deprecated Routes

### ❌ Do NOT Use

- `/api/integrations/gmail/auth` - Old start route (deprecated)
- `/api/integrations/gmail/callback` - Old callback route (deprecated)

These routes relied on `NEXT_PUBLIC_APP_URL` and caused "Invalid URL" crashes.

### ✅ Use Instead

- `/api/integrations/gmail/start` - Canonical start route
- `/api/integrations/gmail/callback-new` - Canonical callback route

## Security Features

### Environment Variable Validation

- All required env vars validated before OAuth flow starts
- Clear error messages if misconfigured
- No silent failures or confusing Google errors

### Request-Derived Redirects

- Redirects built from `request.nextUrl.origin`
- Works in localhost, Vercel preview, and production
- No dependency on `NEXT_PUBLIC_APP_URL`

### Token Encryption

- AES-256-GCM authenticated encryption
- Required in production (hard fail if missing)
- Versioned format for future key rotation

### CSRF Protection

- Nonce-based CSRF protection
- HttpOnly cookie for state verification
- 10-minute expiry on OAuth state

## Diagnostic Logging

All OAuth routes log detailed diagnostic information (no secrets):

```
[Gmail OAuth Start] Configuration validated:
  Client ID: 123456789.apps.goo...
  Redirect URI: http://localhost:3000/api/integrations/gmail/callback-new
[Gmail OAuth Start] ✅ Redirecting to Google OAuth for account: 2a2abd0f-...
[Gmail OAuth Start]    Redirect URI: http://localhost:3000/api/integrations/gmail/callback-new

[OAuth callback-new] Base URL: http://localhost:3000
[OAuth callback-new] Configuration validated
  Client ID: 123456789.apps.goo...
  Redirect URI: http://localhost:3000/api/integrations/gmail/callback-new
[OAuth callback-new] ✅ Tokens encrypted successfully
[OAuth callback-new] ✅ Successfully stored Gmail connection for user: <userId>
```

These logs make OAuth misconfiguration obvious without exposing secrets.

## Architecture

### OAuth Flow Components

1. **Start Route** (`/api/integrations/gmail/start`)
   - Validates environment variables
   - Checks user authentication
   - Verifies account access
   - Generates CSRF nonce
   - Redirects to Google OAuth

2. **Callback Route** (`/api/integrations/gmail/callback-new`)
   - Validates environment variables
   - Verifies CSRF nonce
   - Exchanges code for tokens
   - Encrypts tokens
   - Stores in `gmail_connections` table
   - Redirects to success page

3. **Database Schema** (`gmail_connections`)
   - Per-user connections (not account-level)
   - Encrypted access/refresh tokens
   - Email address for display
   - Revocation support

## Migration from Old Flow

If you were using the old OAuth flow:

1. Update Google Console redirect URI:
   - Remove: `.../api/integrations/gmail/callback`
   - Add: `.../api/integrations/gmail/callback-new`

2. Update environment variables:
   - Old: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - New: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
   - Add: `GOOGLE_OAUTH_REDIRECT_URI` (explicit, not derived)
   - Remove: `NEXT_PUBLIC_APP_URL` (no longer needed for OAuth)

3. Existing connections will continue to work (backward compatible)

4. New connections will use the new per-user flow

## Support

If OAuth issues persist:

1. Check server logs for diagnostic output
2. Verify all environment variables are set correctly
3. Confirm Google Console redirect URIs match exactly
4. Test encryption endpoint: `/api/admin/verify-encryption`
5. Review this guide for common issues

For persistent issues, check:
- Google Cloud Console → APIs & Services → Credentials
- Server logs during OAuth flow
- Network tab in browser dev tools (check redirects)
