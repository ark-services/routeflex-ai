/**
 * FADV (First Advantage) two-step login flow.
 *
 * The FADV portal uses a two-page authentication sequence:
 *   Step 1 — Login page  : Client ID + User ID + Password
 *   Step 2 — Next page   : Security Answer (if prompted)
 *
 * SECURITY NOTES:
 *   • Credentials are NEVER logged — only masked indicators are logged.
 *   • Callers must pass already-decrypted values; this module never touches
 *     the DB or the encryption layer.
 *   • On error, only the error *type* and a generic message are returned.
 *     No credential values are included in any error payload.
 */

// ── Error taxonomy ────────────────────────────────────────────────────────────

export type FadvLoginErrorType =
  | "invalid_credentials"   // wrong Client ID / User ID / Password
  | "wrong_security_answer" // security answer rejected
  | "captcha_or_mfa"        // unexpected CAPTCHA or MFA challenge
  | "layout_change"         // page structure changed — selector no longer matches
  | "network_error"         // HTTP / TCP / timeout error
  | "config_missing";       // required param not supplied

// ── Result types ──────────────────────────────────────────────────────────────

export type FadvLoginResult =
  | { success: true; sessionCookie?: string }
  | { success: false; errorType: FadvLoginErrorType; message: string };

// ── Params ────────────────────────────────────────────────────────────────────

export interface FadvLoginParams {
  /** FADV Client ID (plaintext) */
  clientId: string;
  /** FADV User ID / username (plaintext) */
  username: string;
  /** Decrypted FADV password */
  password: string;
  /** Decrypted FADV security answer */
  securityAnswer: string;
}

// ── performFadvLogin ──────────────────────────────────────────────────────────

/**
 * Performs the two-step FADV login and returns a session cookie on success.
 *
 * Implementation is a stub pending the confirmed FADV portal URL and
 * form field selectors. The structure below models each step so that
 * actual HTTP calls can be dropped in without restructuring.
 *
 * When implemented, replace each TODO block with real fetch() calls
 * and response parsing. Never log `params.password` or `params.securityAnswer`.
 */
export async function performFadvLogin(
  params: FadvLoginParams
): Promise<FadvLoginResult> {
  // Guard: ensure all required fields are present
  if (
    !params.clientId?.trim() ||
    !params.username?.trim() ||
    !params.password?.trim() ||
    !params.securityAnswer?.trim()
  ) {
    return {
      success: false,
      errorType: "config_missing",
      message: "All login credentials are required (Client ID, User ID, Password, Security Answer)",
    };
  }

  console.log("[performFadvLogin] Starting 2-step login", {
    clientId: params.clientId,
    username: params.username,
    // password + securityAnswer intentionally NOT logged
  });

  // ── Step 1: Submit login form (Client ID + User ID + Password) ──────────────
  //
  // TODO: Replace with real implementation once FADV portal URL and form
  // field names are confirmed. The general structure is:
  //
  //   const loginPageUrl = "https://portal.fadv.com/login";  // confirm URL
  //
  //   const loginResponse = await fetch(loginPageUrl, {
  //     method: "POST",
  //     headers: { "Content-Type": "application/x-www-form-urlencoded" },
  //     body: new URLSearchParams({
  //       clientId:  params.clientId,
  //       userId:    params.username,
  //       password:  params.password,
  //       // additional hidden fields as required by the form
  //     }).toString(),
  //     redirect: "manual",
  //   });
  //
  //   // Detect bad credentials (e.g. 401, or redirect to error page)
  //   if (isInvalidCredentials(loginResponse)) {
  //     return { success: false, errorType: "invalid_credentials",
  //              message: "Login failed: invalid Client ID, User ID, or Password" };
  //   }
  //
  //   // Detect CAPTCHA / MFA page
  //   if (isCaptchaPage(loginResponse)) {
  //     return { success: false, errorType: "captcha_or_mfa",
  //              message: "Login blocked by CAPTCHA or multi-factor challenge" };
  //   }
  //
  //   const cookies1 = extractCookies(loginResponse);

  // ── Step 2: Detect and answer the security question ─────────────────────────
  //
  // TODO: Check if a security-question page was returned after step 1.
  //
  //   const body1 = await loginResponse.text();
  //   const needsSecurityAnswer = body1.includes("Security Answer")
  //     || body1.includes("securityAnswer")  // adjust selector as needed
  //     || loginResponse.url.includes("/security");
  //
  //   if (needsSecurityAnswer) {
  //     const securityPageUrl = resolveRedirect(loginResponse, loginPageUrl);
  //     const securityResponse = await fetch(securityPageUrl, {
  //       method: "POST",
  //       headers: {
  //         "Content-Type": "application/x-www-form-urlencoded",
  //         Cookie: cookies1,
  //       },
  //       body: new URLSearchParams({
  //         securityAnswer: params.securityAnswer,
  //       }).toString(),
  //       redirect: "manual",
  //     });
  //
  //     if (isWrongSecurityAnswer(securityResponse)) {
  //       return { success: false, errorType: "wrong_security_answer",
  //                message: "Security answer was rejected" };
  //     }
  //
  //     if (isUnexpectedPage(securityResponse)) {
  //       return { success: false, errorType: "layout_change",
  //                message: "Unexpected page after security answer — FADV layout may have changed" };
  //     }
  //
  //     return { success: true, sessionCookie: extractCookies(securityResponse) };
  //   }
  //
  //   // Security answer was not required on this login
  //   return { success: true, sessionCookie: cookies1 };

  // ── Stub behaviour (remove when real implementation is in place) ────────────
  console.warn(
    "[performFadvLogin] FADV login not yet implemented — returning mock success.",
    {
      clientId: params.clientId,
      username: params.username,
      hasPassword: params.password.length > 0,
      hasSecurityAnswer: params.securityAnswer.length > 0,
    }
  );

  return {
    success: true,
    sessionCookie: `FADV-SESSION-STUB-${Date.now()}`,
  };
}
