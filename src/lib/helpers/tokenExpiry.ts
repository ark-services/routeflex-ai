/**
 * Token expiry/revocation helpers for magic-link portals.
 */

/** Default token lifetime: 90 days */
const TOKEN_EXPIRY_DAYS = 90;
const TOKEN_EXPIRY_MS = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

/**
 * Returns the default expiry timestamp for a newly created token (90 days from now).
 */
export function defaultTokenExpiresAt(): string {
  return new Date(Date.now() + TOKEN_EXPIRY_MS).toISOString();
}

/**
 * Checks whether a token is still valid (not expired, not revoked).
 * Returns null if valid, or an error message string if invalid.
 *
 * Rules:
 * - If token_revoked_at is set → permanently invalid
 * - If token_expires_at is set and in the past → expired
 * - If token_expires_at is NULL → never expires (legacy tokens)
 */
export function checkTokenValidity(
  expiresAt: string | null | undefined,
  revokedAt: string | null | undefined
): string | null {
  if (revokedAt) {
    return "This link has been revoked and is no longer valid.";
  }
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return "This link has expired. Please contact the employer for a new link.";
  }
  return null;
}
