/**
 * FADV session cookie persistence — database layer.
 *
 * Stores encrypted FADV browser cookies in `fadv_connections.encrypted_session_cookies`
 * so serverless deployments (Vercel, Lambda) survive cold starts without losing
 * the FADV session and being forced through the security-question step.
 *
 * Cookie loading precedence in launchFadvContext:
 *   1. Filesystem  (.fadv-cookies/<clientId>.json  /  /tmp/fadv-cookies/<clientId>.json)
 *      — used when the file already exists (local dev + warm serverless instances)
 *   2. Database    (this module)
 *      — injected only when no filesystem file is found (cold-start fallback)
 *
 * After every successful login, callers write cookies to BOTH the filesystem
 * (via saveFadvCookies in browser.ts) AND the database (via saveDbCookies here).
 *
 * Security:
 *   • Cookies are encrypted with AES-256-GCM before storage (same scheme as
 *     encrypted_password / encrypted_security_answer).
 *   • Uses the service-role client to bypass RLS — fadv_connections has no
 *     INSERT/UPDATE RLS policies, matching the pattern in fadv-actions.ts.
 *   • Errors are non-fatal: a failure to load/save cookies just means the next
 *     run will need to go through the security question again.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { encrypt, decrypt } from "@/lib/encryption";
import type { Cookie } from "playwright-core";

// ── Service-role client (bypasses RLS for server-side writes) ─────────────────


// ── loadDbCookies ─────────────────────────────────────────────────────────────

/**
 * Load previously saved FADV session cookies from the database.
 *
 * Returns null if no cookies are stored yet, or on any error (non-fatal).
 * The caller should fall back to prompting the security question when null
 * is returned.
 */
export async function loadDbCookies(companyId: string): Promise<Cookie[] | null> {
  try {
    const { data } = await createServiceClient()
      .from("fadv_connections")
      .select("encrypted_session_cookies")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!data?.encrypted_session_cookies) return null;

    const json = decrypt(data.encrypted_session_cookies);
    const cookies = JSON.parse(json) as Cookie[];
    console.log(`[loadDbCookies] Loaded ${cookies.length} FADV cookies from DB for company ${companyId}`);
    return cookies;
  } catch (err) {
    // Non-fatal — next run will go through the security question
    console.warn("[loadDbCookies] Failed to load cookies from DB:", err);
    return null;
  }
}

// ── saveDbCookies ─────────────────────────────────────────────────────────────

/**
 * Encrypt and persist FADV session cookies to the database.
 *
 * Non-fatal on error — the filesystem copy is the primary store; this is an
 * additional redundant copy for serverless cold-start resilience.
 */
export async function saveDbCookies(companyId: string, cookies: Cookie[]): Promise<void> {
  if (!cookies.length) return;
  try {
    const encrypted = encrypt(JSON.stringify(cookies));
    const { error } = await createServiceClient()
      .from("fadv_connections")
      .update({
        encrypted_session_cookies: encrypted,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);

    if (error) {
      console.warn("[saveDbCookies] DB update error:", error.message);
      return;
    }
    console.log(`[saveDbCookies] Saved ${cookies.length} FADV cookies to DB for company ${companyId}`);
  } catch (err) {
    console.warn("[saveDbCookies] Failed to save cookies to DB:", err);
  }
}
