/**
 * Encryption utilities for storing sensitive tokens
 * Uses AES-256-GCM for authenticated encryption
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const CURRENT_ENCRYPTION_VERSION = 1;

/**
 * Get encryption key from environment
 * Must be a 32-byte (256-bit) base64-encoded key
 *
 * SECURITY: In production, this MUST be set. If missing:
 * - Production: throws hard error (tokens must never be stored in plaintext)
 * - Development: logs loud warning (acceptable for local dev only)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  const isDev = process.env.NODE_ENV === 'development';

  if (!key) {
    if (!isDev) {
      // PRODUCTION: Hard fail - never store tokens in plaintext
      throw new Error(
        '❌ CRITICAL: ENCRYPTION_KEY environment variable not set in production. ' +
        'Tokens cannot be stored without encryption. ' +
        'Generate a key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
      );
    }

    // DEVELOPMENT: Loud warning but allow (local dev only)
    console.error('\n' + '='.repeat(80));
    console.error('⚠️  WARNING: ENCRYPTION_KEY not set - tokens will be stored in PLAINTEXT');
    console.error('   This is INSECURE and only acceptable in local development!');
    console.error('   Generate a key: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
    console.error('   Then add to .env.local: ENCRYPTION_KEY=<generated_key>');
    console.error('='.repeat(80) + '\n');

    throw new Error('ENCRYPTION_KEY not set in development');
  }

  return Buffer.from(key, 'base64');
}

/**
 * Check if encryption is available (key is set)
 */
export function isEncryptionAvailable(): boolean {
  return !!process.env.ENCRYPTION_KEY;
}

/**
 * Encrypt a string value
 * Returns JSON with version, IV, ciphertext, and auth tag
 *
 * Format: { v: 1, d: "base64_encrypted_data" }
 * Where d contains: IV (16 bytes) + ciphertext + auth tag (16 bytes)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Combine IV + encrypted data + auth tag
  const combined = Buffer.concat([
    iv,
    Buffer.from(encrypted, 'base64'),
    authTag
  ]);

  // Return versioned encrypted data for future key rotation
  return JSON.stringify({
    v: CURRENT_ENCRYPTION_VERSION,
    d: combined.toString('base64')
  });
}

/**
 * Decrypt a string value
 * Handles both versioned (new) and legacy (old) encrypted data
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();

  // Try parsing as versioned encrypted data (new format)
  let dataBuffer: Buffer;
  try {
    const parsed = JSON.parse(encryptedData);
    if (parsed.v && parsed.d) {
      // Versioned format: { v: 1, d: "base64_data" }
      dataBuffer = Buffer.from(parsed.d, 'base64');
    } else {
      throw new Error('Not versioned format');
    }
  } catch {
    // Legacy format: plain base64-encoded data (backward compatibility)
    dataBuffer = Buffer.from(encryptedData, 'base64');
  }

  // Extract IV, encrypted data, and auth tag
  const iv = dataBuffer.subarray(0, IV_LENGTH);
  const authTag = dataBuffer.subarray(dataBuffer.length - AUTH_TAG_LENGTH);
  const encrypted = dataBuffer.subarray(IV_LENGTH, dataBuffer.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate a random encryption key for ENCRYPTION_KEY env var
 * Run this once and save the output to your .env.local
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Verify encryption is working correctly (round-trip test)
 * Returns true if encrypt → decrypt returns the original value
 */
export function verifyEncryption(): { success: boolean; error?: string } {
  try {
    if (!isEncryptionAvailable()) {
      return { success: false, error: 'ENCRYPTION_KEY not set' };
    }

    const testValue = 'test-token-' + crypto.randomBytes(16).toString('hex');
    const encrypted = encrypt(testValue);
    const decrypted = decrypt(encrypted);

    if (decrypted !== testValue) {
      return { success: false, error: 'Decrypted value does not match original' };
    }

    // Verify encrypted data doesn't contain plaintext
    if (encrypted.includes(testValue)) {
      return { success: false, error: 'Encrypted data contains plaintext!' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Check if a value appears to be encrypted (not plaintext)
 * This is a heuristic - checks for versioned JSON format
 */
export function isEncrypted(value: string): boolean {
  try {
    const parsed = JSON.parse(value);
    return parsed.v && parsed.d && typeof parsed.v === 'number' && typeof parsed.d === 'string';
  } catch {
    // Could be legacy encrypted format (plain base64) or plaintext
    // Try to detect if it looks like base64-encoded encrypted data
    // Legacy encrypted data is ~100+ chars of base64
    return value.length > 80 && /^[A-Za-z0-9+/]+=*$/.test(value);
  }
}

/**
 * Detect if a token value is likely plaintext (OAuth tokens have specific format)
 * Google OAuth access tokens start with "ya29." and are ~200 chars
 * Refresh tokens are base64-like but ~50-100 chars
 */
export function isPlaintextToken(value: string): boolean {
  if (!value) return false;

  // Google access token pattern
  if (value.startsWith('ya29.')) {
    return true;
  }

  // Generic plaintext detection: not encrypted format and not too short
  if (!isEncrypted(value) && value.length > 20 && value.length < 300) {
    // Likely plaintext if it doesn't look like encrypted data
    return true;
  }

  return false;
}
