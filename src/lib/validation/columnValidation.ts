/**
 * Validation utilities for board column types
 * Provides centralized validation for email, phone, and location columns
 */

/**
 * Validates email addresses
 * Checks for basic email format (contains @ and .)
 */
export function validateEmail(value: string): { valid: boolean; error?: string } {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Email is required' };
  }

  // Basic email validation - must contain @ and . after @
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address' };
  }

  return { valid: true };
}

/**
 * Validates phone numbers
 * Accepts various formats and returns normalized 10-digit value
 * Examples: (123) 456-7890, 123-456-7890, 1234567890
 */
export function validatePhone(value: string): {
  valid: boolean;
  normalized?: string;
  error?: string
} {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Phone number is required' };
  }

  // Extract only digits
  const digits = trimmed.replace(/\D/g, '');

  // Validate exactly 10 digits
  if (digits.length !== 10) {
    return {
      valid: false,
      error: 'Phone number must be 10 digits'
    };
  }

  return {
    valid: true,
    normalized: digits
  };
}

/**
 * Formats a phone number for display
 * Converts 1234567890 to (123) 456-7890
 */
export function formatPhone(value: string): string {
  if (!value) return '';

  // Extract only digits
  const digits = value.replace(/\D/g, '');

  // If not 10 digits, return as-is
  if (digits.length !== 10) return value;

  // Format as (123) 456-7890
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
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
