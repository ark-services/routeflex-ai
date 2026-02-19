/**
 * Validation utilities for board column types
 * Provides centralized validation for email, phone, and location columns
 */

// E.164 regex: + followed by 1-15 digits, first digit non-zero
const E164_RE = /^\+[1-9]\d{1,14}$/;

/**
 * Validates email addresses
 */
export function validateEmail(value: string): { valid: boolean; error?: string } {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Email is required' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address' };
  }

  return { valid: true };
}

/**
 * Validates and normalizes phone numbers to E.164 format.
 *
 * Accepted inputs:
 *   - Already E.164 (starts with +): validated as-is
 *   - 10 raw digits (US):  → +1XXXXXXXXXX
 *   - 11 digits starting with 1 (US with country code): → +1XXXXXXXXXX
 *   - Formatted US numbers like (555) 123-4567, 555-123-4567, etc.
 *     (digits are extracted and treated as 10-digit input)
 *
 * Returns normalized E.164 string in `normalized` on success.
 */
export function validatePhone(value: string): {
  valid: boolean;
  normalized?: string;
  error?: string;
} {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Phone number is required' };
  }

  // Already E.164 — just validate the format
  if (trimmed.startsWith('+')) {
    if (E164_RE.test(trimmed)) {
      return { valid: true, normalized: trimmed };
    }
    return {
      valid: false,
      error: 'Invalid E.164 format (e.g. +15551234567)',
    };
  }

  // Strip non-digits and try to normalize as US number
  const digits = trimmed.replace(/\D/g, '');

  if (digits.length === 10) {
    return { valid: true, normalized: `+1${digits}` };
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return { valid: true, normalized: `+${digits}` };
  }

  return {
    valid: false,
    error: 'Enter a 10-digit US number or E.164 format (e.g. +15551234567)',
  };
}

/**
 * Formats a stored phone number for display.
 *
 * +1XXXXXXXXXX  → +1 (555) 123-4567
 * Other E.164   → unchanged (e.g. +442071234567)
 * Legacy 10-digit raw → (555) 123-4567  (backward compat during migration)
 */
export function formatPhone(value: string): string {
  if (!value) return '';

  // Standard US E.164: +1 followed by exactly 10 digits
  if (/^\+1\d{10}$/.test(value)) {
    const d = value.slice(2); // strip +1
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }

  // Other E.164 (international): display as-is
  if (value.startsWith('+')) {
    return value;
  }

  // Legacy raw 10-digit string (stored before E.164 migration)
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return value;
}

/**
 * Validates location (address/city/state)
 * Simple non-empty check for MVP (freeform text)
 */
export function validateLocation(value: string): { valid: boolean; error?: string } {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: 'Location is required' };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Location is required' };
  }

  return { valid: true };
}
