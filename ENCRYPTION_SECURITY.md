# Token Encryption Security

## Overview

All OAuth tokens (Gmail access/refresh tokens) are encrypted at rest using **AES-256-GCM** authenticated encryption.

## Requirements

### Production (REQUIRED)

```bash
# ENCRYPTION_KEY must be set in production
ENCRYPTION_KEY=<base64-encoded-32-byte-key>
```

**If `ENCRYPTION_KEY` is not set in production:**
- OAuth callback will fail with error: `encryption_failed`
- Tokens will **NEVER** be stored in plaintext
- Application will refuse to store credentials

### Development (Recommended)

```bash
# Recommended: Set ENCRYPTION_KEY even in development
ENCRYPTION_KEY=<base64-encoded-32-byte-key>
```

**If `ENCRYPTION_KEY` is not set in development:**
- Loud warning will be logged
- Tokens stored in plaintext (INSECURE - acceptable only for local dev)
- Warning appears on every OAuth callback

## Setup

### 1. Generate Encryption Key

```bash
# Generate a random 256-bit key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 2. Add to Environment

```bash
# .env.local (development)
ENCRYPTION_KEY=<generated_key>

# Vercel/Production
# Add via Vercel dashboard or deployment config
```

### 3. Verify Encryption Works

```bash
# Call verification endpoint
curl http://localhost:3000/api/admin/verify-encryption

# Expected response:
{
  "available": true,
  "verified": true,
  "message": "Encryption is configured correctly and working"
}
```

## Encryption Format

### Version 1 (Current)

```json
{
  "v": 1,
  "d": "<base64_encoded_data>"
}
```

Where `d` contains:
- **IV** (16 bytes): Initialization vector
- **Ciphertext**: Encrypted token data
- **Auth Tag** (16 bytes): GCM authentication tag

### Algorithm Details

- **Cipher**: AES-256-GCM
- **Key Size**: 256 bits (32 bytes)
- **IV Size**: 128 bits (16 bytes)
- **Auth Tag**: 128 bits (16 bytes)
- **Authenticated Encryption**: Yes (GCM mode)

## Migration

### Encrypt Existing Plaintext Tokens

If you have existing plaintext tokens in your database, run the migration:

```bash
# Call migration endpoint (requires authentication)
curl -X POST http://localhost:3000/api/admin/migrate-encrypt-tokens \
  -H "Authorization: Bearer <your_supabase_jwt>"

# Expected response:
{
  "success": true,
  "migratedCount": 5,
  "totalChecked": 10,
  "durationMs": 234
}
```

**What it does:**
1. Scans all `gmail_connections` records
2. Detects plaintext tokens (starts with `ya29.` or other patterns)
3. Encrypts them using current `ENCRYPTION_KEY`
4. Updates database with encrypted versions
5. Logs migration results

**Safe to run multiple times** - already encrypted tokens are skipped.

## Security Features

### ✅ Implemented

- [x] AES-256-GCM authenticated encryption
- [x] Random IV per encryption (never reused)
- [x] Versioned encryption format (future key rotation)
- [x] Production enforcement (hard fail if key missing)
- [x] Development warnings (loud logging)
- [x] Migration tool for existing plaintext tokens
- [x] Verification endpoint (test encrypt/decrypt)
- [x] Plaintext detection (prevents accidental storage)
- [x] Backward compatibility (decrypts legacy format)

### 🔐 Key Management

**Current:**
- Single encryption key in `ENCRYPTION_KEY` env var
- Base64-encoded 256-bit key
- Stored in Vercel secrets (production)
- Stored in `.env.local` (development)

**Future (Key Rotation):**
- Version field allows migration to new keys
- Old keys can be kept to decrypt legacy data
- New data encrypted with current key

## Troubleshooting

### Error: "ENCRYPTION_KEY not set in production"

**Cause:** `ENCRYPTION_KEY` environment variable missing in production.

**Fix:**
```bash
# Generate key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Add to Vercel/production environment
# Redeploy application
```

### OAuth Fails with "encryption_failed"

**Cause:** Encryption attempt failed (likely missing key in production).

**Fix:**
1. Set `ENCRYPTION_KEY` in production environment
2. Redeploy
3. Retry OAuth flow

### Migration Returns "No connections found"

**Cause:** No Gmail connections exist, or all are already encrypted.

**Action:** No action needed - this is normal.

### How to Check if Tokens are Encrypted

**Query database:**
```sql
SELECT
  id,
  email_address,
  length(access_token) as token_length,
  substring(access_token, 1, 10) as token_start,
  access_token ~ '^ya29\.' as is_plaintext
FROM gmail_connections
WHERE revoked_at IS NULL;
```

**Plaintext token indicators:**
- Starts with `ya29.` (Google access token)
- ~200 characters, no JSON structure
- No `{"v":1,"d":"..."}` wrapper

**Encrypted token indicators:**
- Starts with `{"v":1,"d":"`
- Contains base64 data in `d` field
- ~300-400 characters (includes IV + auth tag)

## API Endpoints

### Verify Encryption

```http
GET /api/admin/verify-encryption
```

**Response:**
```json
{
  "available": true,
  "verified": true,
  "message": "Encryption is configured correctly and working"
}
```

### Migrate Plaintext Tokens

```http
POST /api/admin/migrate-encrypt-tokens
Authorization: Bearer <jwt>
```

**Response:**
```json
{
  "success": true,
  "migratedCount": 5,
  "totalChecked": 10,
  "errors": [],
  "durationMs": 234
}
```

## Files

- `src/lib/encryption.ts` - Core encryption implementation
- `src/app/api/admin/verify-encryption/route.ts` - Verification endpoint
- `src/app/api/admin/migrate-encrypt-tokens/route.ts` - Migration endpoint
- `src/app/api/integrations/gmail/callback-new/route.ts` - OAuth callback (uses encryption)

## Compliance

### Data Protection

- ✅ Tokens encrypted at rest (AES-256-GCM)
- ✅ Tokens encrypted in transit (HTTPS)
- ✅ No plaintext storage in production
- ✅ Authenticated encryption (tamper detection)

### Best Practices

- ✅ Random IV per encryption
- ✅ Separate auth tag verification
- ✅ Version field for key rotation
- ✅ Secure key generation (crypto.randomBytes)
- ✅ Environment-specific enforcement

### Future Improvements

- [ ] Key rotation mechanism
- [ ] Hardware Security Module (HSM) integration
- [ ] Separate encryption keys per environment
- [ ] Automated key rotation schedule
- [ ] Audit logging for encryption operations
