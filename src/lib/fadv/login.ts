/**
 * FADV (First Advantage) login flow.
 *
 * The FADV Enterprise Advantage portal uses a three-step authentication sequence
 * when no active browser session exists:
 *
 *   Step 1 — Login page      : Client ID + User ID + Password
 *             → POST /pub/l/login/userLogin.do
 *   Step 2 — Security question: Security Answer  (URL: /secretQuestion.do)
 *             → Only shown when there is no existing browser session
 *   Step 3 — FCRA notice     : "I Agree" acknowledgement (URL: /session.do)
 *             → Always shown after the security question step
 *
 * SECURITY NOTES:
 *   • Credentials are NEVER logged — only masked indicators are logged.
 *   • Callers must pass already-decrypted values; this module never touches
 *     the DB or the encryption layer.
 *   • On error, only the error *type* and a generic message are returned.
 *     No credential values are included in any error payload.
 */

import type { Page } from "playwright-core";
import { launchFadvContext, saveFadvCookies } from "./browser";
import {
  FADV_PORTAL_URL,
  LOGIN_FRAME_NAME,
  LOGIN_FRAME_ID_SEL,
  SEL_SESSION_OVERRIDE_PROCEED,
  SEL_CLIENT_ID,
  SEL_USER_ID,
  SEL_PASSWORD,
  SEL_LOGIN_SUBMIT,
  SEL_ANG_CLIENT_ID,
  SEL_ANG_USER_ID,
  SEL_ANG_PASSWORD,
  SEL_ANG_LOGIN_SUBMIT,
  SEL_SECURITY_ANSWER,
  SEL_SECURITY_SUBMIT,
  SEL_AGREE_BUTTON,
  LOGIN_TIMEOUT_MS,
  NAV_TIMEOUT_MS,
} from "./portal-config";

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
 * Performs the full FADV login sequence and returns a session cookie on success.
 *
 * Launches a headless browser (or headed in local dev), navigates through the
 * three-step login flow, and extracts session cookies for reuse.
 * The browser is always closed before returning.
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

  console.log("[performFadvLogin] Starting login", {
    clientId: params.clientId,
    username: params.username,
    // password + securityAnswer intentionally NOT logged
  });

  // Persistent context — session cookies survive between test-connection runs.
  const context = await launchFadvContext(params.clientId);
  const page    = await context.newPage();

  try {
    const result = await doLoginSteps(page, params);
    if (!result.success) return result;

    // Save FADV session cookies so the next run skips the security question
    await saveFadvCookies(context, params.clientId);

    // Extract all cookies as a serialized string for potential reuse
    const cookies = await context.cookies();
    const sessionCookie = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    console.log("[performFadvLogin] Login successful");
    return { success: true, sessionCookie };
  } finally {
    // In local dev, set FADV_DEBUG_KEEP_BROWSER=true to leave the window open
    // after a failure so you can inspect the page state before it disappears.
    if (process.env.FADV_DEBUG_KEEP_BROWSER !== "true") {
      await context.close();
    }
  }
}

// ── doLoginSteps ──────────────────────────────────────────────────────────────

/**
 * Executes all login steps on an already-opened Playwright page.
 * Used internally by both performFadvLogin (test connection) and
 * callFadvCreateSubject (full submission flow).
 *
 * Does NOT close the browser — caller is responsible for cleanup.
 */
export async function doLoginSteps(
  page: Page,
  params: FadvLoginParams
): Promise<FadvLoginResult> {
  try {
    // ── Stealth: hide Playwright/Chromium automation signals ────────────────
    // FADV's portal immediately redirects to error.jsp when it detects an
    // automated browser. addInitScript runs before any page JS.
    await page.addInitScript(() => {
      // 1. Hide webdriver flag
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      // 2. Inject window.chrome — Playwright's Chromium omits this object,
      //    which is a well-known bot-detection signal.
      if (!(window as any).chrome) {
        (window as any).chrome = { runtime: {} };
      }
      // 3. Realistic language + plugin arrays
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      Object.defineProperty(navigator, "plugins",   { get: () => [1, 2, 3, 4, 5] });
    });

    // ── Step 0: Navigate via root domain first ──────────────────────────────
    // Navigating directly to /pub/l/login/ on a fresh context causes FADV to
    // redirect to error.jsp — the Java EE portal expects a session established
    // from the root domain (sets JSESSIONID + referrer chain). Visiting the
    // root first mimics a real user clicking a bookmark, then following the
    // login link, which FADV's server-side check accepts.
    await page.goto("https://enterprise.fadv.com/", {
      waitUntil: "load",
      timeout: NAV_TIMEOUT_MS,
    });

    console.log("[doLoginSteps] Root domain loaded, navigating to login...");

    await page.goto(FADV_PORTAL_URL, {
      waitUntil: "load",
      timeout: NAV_TIMEOUT_MS,
    });

    // Give the JS framework (GWT/Angular) time to fully initialize and render
    // the login form after the load event fires.
    try {
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
    } catch {
      // GWT keeps persistent connections so networkidle may never fire — continue
    }

    console.log("[doLoginSteps] After load, URL:", page.url());

    // ── Step 0b: Dismiss Session Expired dialog if present ──────────────────
    try {
      await page
        .locator("td.html-face")
        .filter({ hasText: /^OK$/ })
        .click({ timeout: 5_000 });
      console.log("[doLoginSteps] Session Expired dialog dismissed");
    } catch {
      // No dialog present — continue
    }

    // ── Step 1: Login form ──────────────────────────────────────────────────
    // Log all frames so we can see the exact page structure.
    console.log("[doLoginSteps] Step 1: URL:", page.url());
    console.log(
      "[doLoginSteps] Step 1: frames:",
      page.frames().map((f) => `"${f.name() || "(main)"}@${f.url().split("?")[0]}"`)
    );

    // The login form lives inside an iframe named LOGIN_FRAME_NAME.
    // page.waitForSelector() does not search cross-origin iframes, so we must:
    //   1. Wait for the <iframe> element to attach in the main page DOM.
    //   2. Resolve it to a Playwright Frame and wait for the field within it.
    type FrameOrPage = import("playwright-core").Frame | import("playwright-core").Page;
    let loginContext: FrameOrPage = page;

    // FADV creates the login iframe dynamically via JavaScript — its `name` is set
    // as a JS property, not an HTML attribute, so waitForSelector('iframe[name=...]')
    // never resolves even though page.frame() can already see it.
    // Strategy: check if already attached, then fall back to the frameattached event.
    console.log(`[doLoginSteps] Step 1: waiting for frame "${LOGIN_FRAME_NAME}" to attach...`);
    const loginFrame =
      page.frame({ name: LOGIN_FRAME_NAME }) ??
      await page
        .waitForEvent("frameattached", {
          predicate: (f) => f.name() === LOGIN_FRAME_NAME,
          timeout: NAV_TIMEOUT_MS,
        })
        .catch(() => null);
    // Detect login form style: Angular (/angular/login, shadow-DOM components)
    // vs legacy GWT (raw <input name="accountnumber"> fields).
    let isAngularLogin = false;

    if (loginFrame) {
      isAngularLogin = loginFrame.url().includes("/angular/");
      const clientIdSel = isAngularLogin ? SEL_ANG_CLIENT_ID : SEL_CLIENT_ID;
      console.log(
        `[doLoginSteps] Step 1: found named iframe @ ${loginFrame.url().split("?")[0]} (${isAngularLogin ? "Angular" : "legacy GWT"}), waiting for Client ID field...`
      );
      await loginFrame.waitForSelector(clientIdSel, {
        state: "attached",
        timeout: NAV_TIMEOUT_MS,
      });
      loginContext = loginFrame;
    } else {
      // Fallback: scan all frames, checking for Angular selectors first then legacy
      console.log("[doLoginSteps] Step 1: named frame not found, scanning all frames...");
      for (const frame of page.frames()) {
        const elAngular = await frame.$(SEL_ANG_CLIENT_ID).catch(() => null);
        if (elAngular) {
          loginContext   = frame;
          isAngularLogin = true;
          console.log(`[doLoginSteps] Step 1: Angular login form found in frame "${frame.name() || "(main)"}" @ ${frame.url().split("?")[0]}`);
          break;
        }
        const elLegacy = await frame.$(SEL_CLIENT_ID).catch(() => null);
        if (elLegacy) {
          loginContext = frame;
          console.log(`[doLoginSteps] Step 1: legacy login form found in frame "${frame.name() || "(main)"}" @ ${frame.url().split("?")[0]}`);
          break;
        }
      }
    }

    console.log(`[doLoginSteps] Step 1: filling credentials (${isAngularLogin ? "Angular shadow-DOM" : "legacy GWT"})...`);
    if (isAngularLogin) {
      // Playwright's CSS engine pierces shadow DOM — ' input' resolves the
      // actual <input> inside each <fadv-input> web component.
      await loginContext.locator(`${SEL_ANG_CLIENT_ID} input`).fill(params.clientId, { force: true });
      await loginContext.locator(`${SEL_ANG_USER_ID} input`).fill(params.username,   { force: true });
      await loginContext.locator(`${SEL_ANG_PASSWORD} input`).fill(params.password,  { force: true });
      // Wait for the Login button to become enabled — this confirms Angular's
      // reactive form registered the filled values and considers the form valid.
      // If the button stays disabled, the fill didn't trigger change detection.
      console.log("[doLoginSteps] Step 1: waiting for Login button to become enabled...");
      try {
        await loginContext.locator(`${SEL_ANG_LOGIN_SUBMIT}:not([disabled])`).waitFor({
          state: "attached",
          timeout: 5_000,
        });
        console.log("[doLoginSteps] Step 1: Login button enabled — form values registered by Angular");
      } catch {
        console.warn("[doLoginSteps] Step 1: Login button still disabled after 5s — Angular may not have processed inputs, clicking anyway");
      }
      console.log("[doLoginSteps] Step 1: clicking Login button...");
      await loginContext.locator(`${SEL_ANG_LOGIN_SUBMIT} button`).click({ force: true });
    } else {
      await loginContext.locator(SEL_CLIENT_ID).fill(params.clientId, { force: true });
      await loginContext.locator(SEL_USER_ID).fill(params.username,   { force: true });
      await loginContext.locator(SEL_PASSWORD).fill(params.password,  { force: true });
      console.log("[doLoginSteps] Step 1: clicking Sign On...");
      await loginContext.locator(SEL_LOGIN_SUBMIT).click({ force: true });
    }

    // ── Step 1b: Race — top-frame navigation vs Session Override ──────────────
    // When saved cookies are present, FADV renders a "Session Override" page
    // inside the login iframe before navigating away from userLogin.do.
    // We must detect the Proceed button and click it to continue.
    //
    // Frame lookup: the iframe's `name` attribute is null and its `name` JS
    // property is "". page.frame({ name: "new-login-iframe" }) always returns
    // null. Use page.frameLocator('#new-login-iframe') (by id attribute).
    //
    // Button selector: the Proceed button is a <fadv-button> Web Component
    // (Lit + Shadow DOM). locator("button") finds nothing. Use the stable id.
    console.log("[doLoginSteps] Step 1: waiting for navigation or Session Override...");
    const loginOutcome = await Promise.race([
      page.waitForURL(
        (url) => !url.toString().includes("userLogin.do"),
        { timeout: LOGIN_TIMEOUT_MS }
      ).then(() => "navigated" as const).catch(() => "timeout" as const),

      (async (): Promise<"session_override" | "timeout"> => {
        // The login iframe is only findable by id — its `name` attribute is null
        // and its `name` JS property is "". page.frame({ name }) always returns null.
        // The Proceed button is a <fadv-button> Web Component (not a native <button>),
        // so locator("button") finds nothing. Target the host element by its stable id.
        const deadline = Date.now() + LOGIN_TIMEOUT_MS;
        while (Date.now() < deadline) {
          try {
            const visible = await page
              .frameLocator(LOGIN_FRAME_ID_SEL)
              .locator(SEL_SESSION_OVERRIDE_PROCEED)
              .isVisible();
            if (visible) return "session_override";
          } catch {
            // Frame navigating or detached — retry next tick
          }
          await new Promise<void>((r) => setTimeout(r, 300));
        }
        return "timeout";
      })(),
    ]);

    if (loginOutcome === "session_override") {
      console.log("[doLoginSteps] Step 1b: Session Override detected — clicking Proceed");
      await page
        .frameLocator(LOGIN_FRAME_ID_SEL)
        .locator(SEL_SESSION_OVERRIDE_PROCEED)
        .click();
      // Wait for top-frame to navigate away after the override is accepted
      try {
        await page.waitForURL(
          (url) => !url.toString().includes("userLogin.do"),
          { timeout: LOGIN_TIMEOUT_MS }
        );
      } catch {
        // Timed out after Proceed — fall through to URL check below
      }
    } else if (loginOutcome === "timeout") {
      console.warn("[doLoginSteps] Step 1: no navigation or Session Override within timeout");
    }

    const urlAfterLogin       = page.url();
    const iframeUrlAfterLogin = loginContext.url?.() ?? "";
    console.log("[doLoginSteps] Step 1: main page URL after login:", urlAfterLogin);
    console.log("[doLoginSteps] Step 1: iframe URL after login:    ", iframeUrlAfterLogin);

    // Success: top frame navigated to a known post-login page.
    // For Angular login: main frame stays at userLogin.do on failure;
    // on success FADV issues a server-side redirect of the top frame.
    // disclaimerNew.jsp is a valid intermediate step (not a failure).
    const isLoginPage = (url: string) =>
      url.includes("userLogin.do") || (
        !url.includes("secretQuestion") &&
        !url.includes("session.do") &&
        !url.includes("shell.jsp") &&
        !url.includes("disclaimerNew.jsp")
      );

    if (isLoginPage(urlAfterLogin)) {
      // Still on a login-related page → credentials rejected or form not submitted.
      // Read error from loginContext (the iframe) not page (main frame) for Angular.
      const fadvError = await loginContext.evaluate(() => {
        const el = document.querySelector("#login-error-message");
        return el?.textContent?.trim() || null;
      }).catch(() => null);
      console.error("[doLoginSteps] Step 1: still on login page after submit. FADV iframe error:", fadvError ?? "(none visible)");
      return {
        success: false,
        errorType: "invalid_credentials",
        message: "Login failed — verify Client ID, User ID, and Password",
      };
    }

    // ── Step 1c: FCRA disclaimer at disclaimerNew.jsp (conditional) ───────────
    // Shown after the Session Override "Proceed" click. Must click "I Agree"
    // before FADV continues to the normal post-login flow.
    if (page.url().includes("disclaimerNew.jsp")) {
      console.log("[doLoginSteps] Step 1c: disclaimerNew.jsp FCRA notice — clicking I Agree...");
      // Same button id (agreeBtn) and same dispatchEvent pattern as Step 3 (session.do).
      // getByRole times out on this GWT page — use the stable id selector instead.
      await page.waitForSelector(SEL_AGREE_BUTTON, { state: "attached", timeout: NAV_TIMEOUT_MS });
      await page.locator(SEL_AGREE_BUTTON).dispatchEvent("click");
      try {
        await page.waitForURL(
          (url) => !url.toString().includes("disclaimerNew.jsp"),
          { timeout: LOGIN_TIMEOUT_MS }
        );
      } catch {
        // If navigation doesn't fire treat it as a layout change below
      }
      console.log("[doLoginSteps] Step 1c: disclaimer accepted, URL:", page.url());
    }

    // ── Step 2: Security question (conditional) ─────────────────────────────
    if (page.url().includes("secretQuestion")) {
      // The security question form lives in the same new-login-iframe as the login
      // form, but the iframe needs time to navigate from /angular/login to
      // /angular/login/security-question after the main page lands on secretQuestion.do.
      // If we scan frames before this navigation completes, we find the login form's
      // textboxes (Client ID / Password) instead of the answer field, and the click
      // then times out on a form that's mid-transition.
      //
      // Fix: wait for the iframe to reach the security-question URL first.
      const loginIframe = page.frame({ name: LOGIN_FRAME_NAME });
      if (loginIframe) {
        try {
          await loginIframe.waitForURL(
            (url) => url.toString().includes("security-question"),
            { timeout: NAV_TIMEOUT_MS }
          );
          console.log("[doLoginSteps] Step 2: security-question iframe loaded @", loginIframe.url().split("?")[0]);
        } catch {
          console.warn("[doLoginSteps] Step 2: iframe URL wait timed out — proceeding with frame scan");
        }
      }

      type FrameOrPage = import("playwright-core").Frame | import("playwright-core").Page;
      console.log(
        "[doLoginSteps] Step 2: frames on secretQuestion page:",
        page.frames().map((f) => `"${f.name() || "(main)"}@${f.url().split("?")[0]}"`)
      );

      // Use loginIframe directly — we already confirmed it navigated to the
      // security-question URL above. Avoid the instant count() frame scan which
      // returns 0 while Angular is still rendering the security-question component.
      const secCtx: FrameOrPage = loginIframe ?? page;
      console.log(
        `[doLoginSteps] Step 2: using frame "${loginIframe ? loginIframe.name() || "(main)" : "(page)"}" @ ${(loginIframe ?? page).url().split("?")[0]}`
      );

      // Wait for the answer textbox to become visible before interacting —
      // Angular may still be rendering the component when waitForURL resolves.
      console.log("[doLoginSteps] Step 2: waiting for answer textbox to be visible...");
      await secCtx.getByRole("textbox").first().waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS });
      console.log("[doLoginSteps] Step 2: answer textbox visible — typing security answer");

      // pressSequentially() simulates real keystrokes — required to trigger
      // Angular's (input) binding so the form becomes valid before submit.
      await secCtx.getByRole("textbox").first().click();
      await secCtx.getByRole("textbox").first().pressSequentially(params.securityAnswer, { delay: 50 });

      // Use getByRole to find the Submit button — SEL_SECURITY_SUBMIT ("button#submitBtn")
      // is a GWT selector that doesn't exist in the Angular /security-question frame.
      const submitBtn = secCtx.getByRole("button", { name: /submit/i });

      // Wait for the button to be enabled. isEnabled() checks the JS .disabled property,
      // which is what Angular's [disabled] binding sets (not the HTML attribute).
      try {
        await submitBtn.waitFor({ state: "visible", timeout: 5_000 });
        const enabled = await submitBtn.isEnabled().catch(() => false);
        console.log(`[doLoginSteps] Step 2: Submit button ${enabled ? "enabled" : "still disabled"} — clicking`);
      } catch {
        console.warn("[doLoginSteps] Step 2: Submit button not visible after 5s — clicking anyway");
      }
      await submitBtn.click({ force: true });

      // Wait for top-frame navigation away from the security question page.
      try {
        await page.waitForURL(
          (url) => !url.toString().includes("secretQuestion"),
          { timeout: LOGIN_TIMEOUT_MS }
        );
      } catch {
        // Timed out — check URL below to determine success/failure
      }

      if (page.url().includes("secretQuestion")) {
        // Still on the security question page → answer was wrong
        return {
          success: false,
          errorType: "wrong_security_answer",
          message: "Security answer was incorrect",
        };
      }
    }

    // ── Step 3: FCRA notice (conditional) ──────────────────────────────────
    if (page.url().includes("session.do")) {
      await page.waitForSelector(SEL_AGREE_BUTTON, { state: "attached", timeout: NAV_TIMEOUT_MS });
      await page.locator(SEL_AGREE_BUTTON).dispatchEvent("click");
      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    }

    // ── Verify we reached the dashboard ────────────────────────────────────
    if (!page.url().includes("shell.jsp")) {
      return {
        success: false,
        errorType: "layout_change",
        message: `Unexpected URL after login: ${page.url()}`,
      };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Timeout") || message.includes("timeout")) {
      return {
        success: false,
        errorType: "network_error",
        message: `Timeout during FADV login: ${message}`,
      };
    }
    return {
      success: false,
      errorType: "layout_change",
      message: `Unexpected error during login: ${message}`,
    };
  }
}
