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
import { loadDbCookies, saveDbCookies } from "./cookie-store";
import {
  FADV_PORTAL_URL,
  FADV_SHELL_URL,
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
  SEL_SEC_Q_INPUT,
  SEL_SEC_Q_SUBMIT,
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
  /**
   * Supabase company UUID. When provided, session cookies are loaded from the
   * database before launching the browser (cold-start fallback) and saved back
   * to the database after a successful login (for serverless resilience).
   */
  companyId?: string;
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

  // Load DB cookies as a cold-start fallback (serverless: /tmp is wiped on cold start)
  const dbCookies = params.companyId ? await loadDbCookies(params.companyId) : undefined;

  // Persistent context — session cookies survive between test-connection runs.
  const context = await launchFadvContext(params.clientId, dbCookies ?? undefined);
  const page    = await context.newPage();

  try {
    const result = await doLoginSteps(page, params);
    if (!result.success) return result;

    // Save FADV session cookies so the next run skips the security question.
    // Also persist to DB for serverless cold-start resilience.
    const savedCookies = await saveFadvCookies(context, params.clientId);
    if (params.companyId && savedCookies.length > 0) {
      await saveDbCookies(params.companyId, savedCookies);
    }

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

    // ── Cookie fast-path ─────────────────────────────────────────────────────
    // The Playwright context was pre-loaded with valid DB cookies (done in
    // performFadvLogin / callFadvCreateSubject before invoking doLoginSteps).
    // Try navigating directly to the dashboard shell; if FADV accepts the
    // existing session the top frame lands on shell.jsp and we are done.
    //
    // Why this avoids Session Override:
    //   Session Override is triggered when the LOGIN FORM is submitted while
    //   FADV already has an active session for that user.  Direct navigation
    //   with valid cookies continues the existing session without re-submitting
    //   credentials, so the override page is never shown.
    console.log("[doLoginSteps] Trying cookie fast-path → shell.jsp...");
    try {
      await page.goto(FADV_SHELL_URL, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
      if (page.url().includes("shell.jsp")) {
        console.log("[doLoginSteps] Cookie fast-path succeeded — existing session valid, skipping login form");
        return { success: true };
      }
      console.log(
        "[doLoginSteps] Cookie fast-path: redirected to",
        page.url().split("?")[0],
        "— proceeding with login form"
      );
    } catch (e) {
      console.log(
        "[doLoginSteps] Cookie fast-path: navigation failed, proceeding with login form:",
        e instanceof Error ? e.message : String(e)
      );
    }

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

    // FADV's login form may live inside an iframe named LOGIN_FRAME_NAME, or
    // directly on the main page (as of a 2026 layout update). Use a short wait
    // (3 s) for the named iframe so we don't burn the full 30 s on pages where
    // FADV dropped the iframe wrapper, then fall through to a frame+main scan.
    console.log(`[doLoginSteps] Step 1: checking for frame "${LOGIN_FRAME_NAME}"...`);
    const loginFrame =
      page.frame({ name: LOGIN_FRAME_NAME }) ??
      await page
        .waitForEvent("frameattached", {
          predicate: (f) => f.name() === LOGIN_FRAME_NAME,
          timeout: 3_000,
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
      // Fallback: scan all frames AND the main page, Angular selectors first then legacy.
      // As of early 2026 the login form is rendered directly on the main page (no iframe).
      console.log("[doLoginSteps] Step 1: named frame not found, scanning main page + frames...");
      let loginFormFound = false;
      const allContexts = [page, ...page.frames()];
      for (const ctx of allContexts) {
        const elAngular = await ctx.$(SEL_ANG_CLIENT_ID).catch(() => null);
        if (elAngular) {
          loginContext   = ctx;
          isAngularLogin = true;
          loginFormFound = true;
          const label = ctx === page ? "(main page)" : `frame "${(ctx as import("playwright-core").Frame).name() || "(unnamed)"}"`;
          console.log(`[doLoginSteps] Step 1: Angular login form found in ${label} @ ${ctx.url().split("?")[0]}`);
          break;
        }
        const elLegacy = await ctx.$(SEL_CLIENT_ID).catch(() => null);
        if (elLegacy) {
          loginContext = ctx;
          loginFormFound = true;
          const label = ctx === page ? "(main page)" : `frame "${(ctx as import("playwright-core").Frame).name() || "(unnamed)"}"`;
          console.log(`[doLoginSteps] Step 1: legacy login form found in ${label} @ ${ctx.url().split("?")[0]}`);
          break;
        }
      }

      // ── CAPTCHA / bot-detection check ───────────────────────────────────────
      // FADV may show a CAPTCHA challenge to datacenter IPs. Check for known
      // CAPTCHA elements before proceeding, so we give a clear error.
      if (!loginFormFound) {
        const captchaPresent = await page.$('#cImage, #captcha, [class*="captcha"], [id*="captcha"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]').catch(() => null);
        if (captchaPresent) {
          console.error("[doLoginSteps] Step 1: CAPTCHA detected — automated login blocked");
          return {
            success: false,
            errorType: "captcha_or_mfa",
            message: "FADV is showing a CAPTCHA challenge (likely due to datacenter IP). Manual login required to establish a session.",
          };
        }

        // No login form and no CAPTCHA — dump page state for diagnostics
        const pageTitle = await page.title().catch(() => "(unknown)");
        const bodyText = await page.evaluate(() =>
          (document.body?.innerText || "").slice(0, 500)
        ).catch(() => "(could not read body)");
        console.error("[doLoginSteps] Step 1: NO login form found anywhere.", {
          url: page.url(),
          title: pageTitle,
          bodyPreview: bodyText,
          frames: page.frames().map((f) => `"${f.name() || "(main)"}@${f.url().split("?")[0]}"`),
        });
        return {
          success: false,
          errorType: "layout_change",
          message: `No login form found on page. URL: ${page.url()} | Title: ${pageTitle} | Body: ${bodyText.slice(0, 200)}`,
        };
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

    // ── Step 1b: Session Override detection and handling ──────────────────────
    // When FADV detects an active session, it shows a Session Override page
    // (still at userLogin.do) with a Proceed button inside #new-login-iframe.
    // The iframe src becomes 'angular/login/session-override' and the Angular
    // app renders <fadv-button id="login-proceed-button"> (Lit + Shadow DOM).
    //
    // Detection strategy: watch the iframe src attribute via waitForFunction —
    // this is instantaneous and doesn't require Angular to finish rendering.
    // We also race against navigation away from userLogin.do.
    //
    // Click strategy: wait up to 20 s for Angular to render the button, then
    // pierce the shadow DOM (button.button__interior inside fadv-button).
    //
    // ⚠️  Known prod failure mode (2026-03):
    //   After the Proceed click, FADV briefly hops through an intermediate URL
    //   (e.g. disclaimerNew.jsp) before redirecting BACK to userLogin.do?type=ee.
    //   waitForURL fires on the brief hop so urlAfterLogin captures the wrong URL.
    //   Fix: add a networkidle stabilisation step so we read the *settled* URL.
    console.log("[doLoginSteps] Step 1b: watching for navigation or Session Override...");
    const sessionOverrideFrame = page.frameLocator(LOGIN_FRAME_ID_SEL);

    const loginOutcome = await Promise.race([
      // Side A: navigation to any page other than the login page
      page.waitForURL(
        (url) => !url.toString().includes("userLogin.do"),
        { timeout: LOGIN_TIMEOUT_MS }
      ).then(() => "navigated" as const).catch(() => "timeout" as const),

      // Side B: iframe src flips to session-override (reliable, no DOM parsing)
      page.waitForFunction(
        () => {
          const iframe = document.getElementById("new-login-iframe") as HTMLIFrameElement | null;
          const s = iframe?.src ?? "";
          return !!(s.includes("session-override") || s.includes("Session%20Override"));
        },
        undefined,
        { timeout: LOGIN_TIMEOUT_MS, polling: 300 }
      ).then(() => "session_override" as const).catch(() => "not_found" as const),
    ]);

    // Log the iframe src so we can see what FADV loaded into it
    const iframeSrcAfterRace = await page.evaluate(() => {
      const el = document.getElementById("new-login-iframe") as HTMLIFrameElement | null;
      return el?.src ?? "(iframe not found)";
    }).catch(() => "(evaluate failed)");

    console.log(
      "[doLoginSteps] Step 1b: race outcome =", loginOutcome,
      "| URL =", page.url().split("?")[0],
      "| iframe src =", iframeSrcAfterRace.split("?")[0]
    );

    // ── Handle Session Override ────────────────────────────────────────────────
    // Confirm we're on the session-override page regardless of which side won the
    // race (handles: direct detection, intermediate redirect, or timeout).
    let onSessionOverridePage = loginOutcome === "session_override";
    if (!onSessionOverridePage && page.url().includes("userLogin.do")) {
      // Re-check the iframe src — catches cases where waitForURL "navigated" fired
      // on an intermediate redirect that returned to userLogin.do, or where both
      // sides timed out but Session Override is still showing.
      onSessionOverridePage = await page.evaluate(() => {
        const iframe = document.getElementById("new-login-iframe") as HTMLIFrameElement | null;
        const s = iframe?.src ?? ""; return !!(s.includes("session-override") || s.includes("Session%20Override"));
      }).catch(() => false);
      if (onSessionOverridePage) {
        console.log("[doLoginSteps] Step 1b: Session Override confirmed via fallback iframe-src check");
      }
    }

    if (onSessionOverridePage) {
      console.log("[doLoginSteps] Step 1b: Session Override confirmed — waiting for Proceed button...");
      // Give Angular time to mount the session-override component and render the button.
      // Try visible first; fall back to attached (the element may be off-screen / Playwright
      // may not compute visibility correctly for Lit shadow-DOM components).
      let proceedReady = false;
      try {
        await sessionOverrideFrame
          .locator(SEL_SESSION_OVERRIDE_PROCEED)
          .waitFor({ state: "visible", timeout: 20_000 });
        proceedReady = true;
        console.log("[doLoginSteps] Step 1b: Proceed button is visible");
      } catch (e1) {
        console.warn("[doLoginSteps] Step 1b: Proceed button not visible after 20s:", e1 instanceof Error ? e1.message : String(e1));
        try {
          await sessionOverrideFrame
            .locator(SEL_SESSION_OVERRIDE_PROCEED)
            .waitFor({ state: "attached", timeout: 10_000 });
          proceedReady = true;
          console.log("[doLoginSteps] Step 1b: Proceed button attached (not visible)");
        } catch (e2) {
          console.warn("[doLoginSteps] Step 1b: Proceed button not attached either:", e2 instanceof Error ? e2.message : String(e2));
          proceedReady = true; // attempt click regardless
        }
      }

      if (proceedReady) {
        let clickMethod = "(none attempted)";
        try {
          // Primary: pierce Lit shadow DOM → inner <button class="button__interior">
          // Use pierce: selector engine explicitly — more reliable than implicit CSS piercing
          // in headless mode.
          await sessionOverrideFrame
            .locator(`${SEL_SESSION_OVERRIDE_PROCEED} >> pierce=button.button__interior`)
            .click({ timeout: 10_000 });
          clickMethod = "pierce=button.button__interior";
        } catch (eA) {
          console.warn("[doLoginSteps] Step 1b: primary click (pierce) failed:", eA instanceof Error ? eA.message : String(eA));
          try {
            // Fallback A: CSS shadow-piercing selector (original approach)
            await sessionOverrideFrame
              .locator(`${SEL_SESSION_OVERRIDE_PROCEED} button.button__interior`)
              .click({ timeout: 10_000 });
            clickMethod = "CSS-pierce button.button__interior";
          } catch (eB) {
            console.warn("[doLoginSteps] Step 1b: CSS-pierce click failed:", eB instanceof Error ? eB.message : String(eB));
            try {
              // Fallback B: click the <fadv-button> host element
              await sessionOverrideFrame
                .locator(SEL_SESSION_OVERRIDE_PROCEED)
                .click({ force: true, timeout: 5_000 });
              clickMethod = "fadv-button host (force)";
            } catch (eC) {
              console.warn("[doLoginSteps] Step 1b: host click failed:", eC instanceof Error ? eC.message : String(eC));
              try {
                // Fallback C: plain text locator — Angular renders "Proceed" as button text
                await sessionOverrideFrame.getByText("Proceed").click({ force: true, timeout: 5_000 });
                clickMethod = "getByText(Proceed)";
              } catch (eD) {
                console.error("[doLoginSteps] Step 1b: ALL click attempts failed:", eD instanceof Error ? eD.message : String(eD));
                clickMethod = "ALL FAILED";
              }
            }
          }
        }
        console.log("[doLoginSteps] Step 1b: click method used →", clickMethod);

        // Wait for the top frame to navigate away from userLogin.do
        try {
          await page.waitForURL(
            (url) => !url.toString().includes("userLogin.do"),
            { timeout: LOGIN_TIMEOUT_MS }
          );
          console.log("[doLoginSteps] Step 1b: navigated after Proceed → (preliminary) URL =", page.url().split("?")[0]);
        } catch {
          console.warn("[doLoginSteps] Step 1b: navigation after Proceed timed out, URL:", page.url().split("?")[0]);
        }

        // ── Stabilisation ─────────────────────────────────────────────────────
        // FADV may hop through an intermediate URL (e.g. disclaimerNew.jsp) before
        // settling. Wait for networkidle so we capture the *final* settled URL.
        // Without this, urlAfterLogin can capture the hop URL, causing all the
        // post-login checks below to run against the wrong URL.
        try {
          await page.waitForLoadState("networkidle", { timeout: 8_000 });
        } catch {
          // Persistent GWT connections prevent networkidle — that's normal
        }
        console.log("[doLoginSteps] Step 1b: settled URL after Proceed =", page.url().split("?")[0]);

        // If FADV redirected back to the login/session-override page after the
        // Proceed click, the saved session cookies are expired or invalid.
        // Treat this as a recoverable auth issue rather than falling through to
        // "Did not reach dashboard" (which is misleading in this scenario).
        if (page.url().includes("userLogin.do")) {
          const stillSessionOverride = await page.evaluate(() => {
            const iframe = document.getElementById("new-login-iframe") as HTMLIFrameElement | null;
            const s = iframe?.src ?? ""; return !!(s.includes("session-override") || s.includes("Session%20Override"));
          }).catch(() => false);
          console.error(
            "[doLoginSteps] Step 1b: URL returned to userLogin.do after Proceed click.",
            "Session override still showing:", stillSessionOverride,
            "| click method was:", clickMethod
          );
          return {
            success: false,
            errorType: "layout_change",
            message: `Session Override Proceed click did not navigate away from login page (click: ${clickMethod}, session-override still showing: ${stillSessionOverride}). Session cookies may be expired — try re-testing FADV credentials to establish a fresh session.`,
          };
        }
      }
    } else if (loginOutcome === "timeout") {
      console.warn("[doLoginSteps] Step 1b: no navigation and no Session Override within timeout");
    }

    // ── Stabilise after any post-submit navigation ────────────────────────────
    // Even on the non-session-override path, FADV may redirect through intermediate
    // pages before settling. Wait briefly so urlAfterLogin is the final URL.
    try {
      await page.waitForLoadState("networkidle", { timeout: 5_000 });
    } catch {
      // GWT keeps persistent connections — networkidle may not fire
    }

    let urlAfterLogin         = page.url();
    const iframeUrlAfterLogin = loginContext.url?.() ?? "";
    console.log("[doLoginSteps] Step 1: main page URL after login (settled):", urlAfterLogin);
    console.log("[doLoginSteps] Step 1: iframe URL after login:             ", iframeUrlAfterLogin);

    // ── Diagnostic dump — remove after debugging ──────────────────────────────
    const diagDump = await page.evaluate(() => {
      const iframe = document.getElementById("new-login-iframe") as HTMLIFrameElement | null;
      const bodyText = (document.body?.innerText || "").slice(0, 1000);
      return {
        iframeSrc:   iframe?.src ?? "(no iframe)",
        iframeName:  iframe?.name ?? "(no name)",
        iframeId:    iframe?.id ?? "(no id)",
        bodyPreview: bodyText,
      };
    }).catch((e: unknown) => ({ error: String(e) }));
    console.log("[doLoginSteps] DIAG DUMP:", JSON.stringify(diagDump, null, 2));

    // ── Session Override re-check (post-stabilisation) ────────────────────────
    // If loginOutcome was "navigated" (a brief intermediate redirect fired
    // waitForURL before the session-override iframe src was set), the page may
    // have returned to userLogin.do with the Session Override still showing.
    // The in-race fallback at Step 1b only checks at the instant the race
    // resolves; by then the URL may not yet be back at userLogin.do.
    // Re-check here, after stabilisation, so we never miss it.
    if (urlAfterLogin.includes("userLogin.do") && !onSessionOverridePage) {
      const soPostStabilise = await page.evaluate(() => {
        const iframe = document.getElementById("new-login-iframe") as HTMLIFrameElement | null;
        const s = iframe?.src ?? ""; return !!(s.includes("session-override") || s.includes("Session%20Override"));
      }).catch(() => false);

      if (soPostStabilise) {
        console.log("[doLoginSteps] Step 1b (post-stabilise): Session Override detected — clicking Proceed...");
        const soFrame = page.frameLocator(LOGIN_FRAME_ID_SEL);
        try {
          await soFrame.locator(SEL_SESSION_OVERRIDE_PROCEED).waitFor({ state: "visible", timeout: 15_000 });
        } catch { /* proceed regardless */ }

        let soClickMethod = "(none)";
        try {
          await soFrame.locator(`${SEL_SESSION_OVERRIDE_PROCEED} >> pierce=button.button__interior`).click({ timeout: 10_000 });
          soClickMethod = "pierce";
        } catch {
          try {
            await soFrame.locator(`${SEL_SESSION_OVERRIDE_PROCEED} button.button__interior`).click({ timeout: 10_000 });
            soClickMethod = "CSS-pierce";
          } catch {
            try {
              await soFrame.locator(SEL_SESSION_OVERRIDE_PROCEED).click({ force: true, timeout: 5_000 });
              soClickMethod = "host";
            } catch {
              try {
                await soFrame.getByText("Proceed").click({ force: true, timeout: 5_000 });
                soClickMethod = "getByText";
              } catch (eSO) {
                soClickMethod = "ALL FAILED";
                console.error("[doLoginSteps] Step 1b (post-stabilise): ALL Proceed clicks failed:", eSO instanceof Error ? eSO.message : String(eSO));
              }
            }
          }
        }
        console.log("[doLoginSteps] Step 1b (post-stabilise): click method →", soClickMethod);

        try {
          await page.waitForURL(
            (url) => !url.toString().includes("userLogin.do"),
            { timeout: LOGIN_TIMEOUT_MS }
          );
        } catch {
          console.warn("[doLoginSteps] Step 1b (post-stabilise): navigation after Proceed timed out, URL:", page.url().split("?")[0]);
        }
        try { await page.waitForLoadState("networkidle", { timeout: 8_000 }); } catch {}
        console.log("[doLoginSteps] Step 1b (post-stabilise): settled URL =", page.url().split("?")[0]);

        if (page.url().includes("userLogin.do")) {
          return {
            success: false,
            errorType: "layout_change",
            message: `Session Override Proceed click (post-stabilise) did not navigate away (click: ${soClickMethod}). Session cookies may be expired — try re-testing FADV credentials.`,
          };
        }

        // Proceed succeeded — update urlAfterLogin and fall through to post-login steps
        urlAfterLogin = page.url();
      }
    }

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
      // ARCHITECTURE (confirmed via live DOM inspection 2026-03-07):
      //
      // The MAIN PAGE has two hidden GWT elements:
      //   • input[name="answer"]  — hidden backing field (type="password")
      //   • button#submitBtn      — hidden submit button
      //
      // The VISIBLE form is Angular, loaded inside the SAME #new-login-iframe
      // used for Step 1 login (src: /angular/login/security-question).
      // Components are Lit web components with shadow DOM:
      //   • fadv-input#security-question-input  → shadow DOM: input[type="password"]
      //   • fadv-button#security-question-submit-button → shadow DOM: button (starts DISABLED)
      //
      // Previous iterations tried to fill the hidden GWT input and dispatch events
      // to the main page DOM — this never reached the Angular iframe's shadow DOM.
      //
      // Correct strategy:
      //   1. Use page.frameLocator('#new-login-iframe') to scope into the iframe.
      //   2. Fill via SEL_SEC_Q_INPUT (Playwright pierces shadow DOM automatically).
      //   3. Wait for the Submit button to become enabled (Angular validates on input).
      //   4. Click the Submit button.
      //   5. Fall back to hidden GWT path only if the iframe approach fails.

      console.log(
        "[doLoginSteps] Step 2: frames on secretQuestion page:",
        page.frames().map((f) => `"${f.name() || "(main)"}@${f.url().split("?")[0]}"`)
      );

      // Give the Angular overlay iframe time to attach and render its form.
      await new Promise<void>((r) => setTimeout(r, 2_000));

      // ── Primary path: Angular iframe with Lit web components ─────────────
      let answeredViaAngular = false;
      try {
        const iframeCtx = page.frameLocator(LOGIN_FRAME_ID_SEL);

        // Wait for the shadow-DOM-pierced input to be attached in the iframe.
        await iframeCtx.locator(SEL_SEC_Q_INPUT).waitFor({ state: "attached", timeout: 8_000 });
        console.log("[doLoginSteps] Step 2: Angular security-question input found inside #new-login-iframe");

        // pressSequentially triggers Angular's (input) event binding on the
        // reactive FormControl — .fill() does not dispatch the events Angular needs.
        await iframeCtx.locator(SEL_SEC_Q_INPUT).click({ force: true });
        await iframeCtx.locator(SEL_SEC_Q_INPUT).pressSequentially(params.securityAnswer, { delay: 50 });

        // The Submit button starts with [disabled] and only becomes enabled once
        // Angular's FormControl validates the input as non-empty.
        // Wait up to 5 s for it to become enabled before clicking.
        console.log("[doLoginSteps] Step 2: waiting for Submit button to become enabled...");
        try {
          await iframeCtx.locator(`${SEL_SEC_Q_SUBMIT}:not([disabled])`).waitFor({
            state: "attached",
            timeout: 5_000,
          });
          console.log("[doLoginSteps] Step 2: Submit button is enabled — clicking");
        } catch {
          console.warn("[doLoginSteps] Step 2: Submit button still disabled after 5s — clicking anyway");
        }
        await iframeCtx.locator(SEL_SEC_Q_SUBMIT).click({ force: true });
        answeredViaAngular = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[doLoginSteps] Step 2: Angular iframe path failed, trying GWT fallback:", msg);
      }

      // ── Fallback: hidden GWT input on main page ───────────────────────────
      if (!answeredViaAngular) {
        const gwtInput = await page.$(SEL_SECURITY_ANSWER).catch(() => null);
        if (gwtInput) {
          console.log("[doLoginSteps] Step 2: GWT fallback — force-filling hidden input");
          await page.locator(SEL_SECURITY_ANSWER).fill(params.securityAnswer, { force: true });
          await new Promise<void>((r) => setTimeout(r, 500));
          const gwtSubmit = await page.$(SEL_SECURITY_SUBMIT).catch(() => null);
          if (gwtSubmit) {
            console.log("[doLoginSteps] Step 2: clicking GWT submitBtn");
            await page.locator(SEL_SECURITY_SUBMIT).click({ force: true });
          } else {
            console.warn("[doLoginSteps] Step 2: GWT submitBtn not found — pressing Enter");
            await page.keyboard.press("Enter").catch(() => {});
          }
        } else {
          console.error("[doLoginSteps] Step 2: no answer input found anywhere on page", { url: page.url() });
          return {
            success: false,
            errorType: "layout_change",
            message: `Security question input not found. FADV may have changed its page structure. URL: ${page.url()}`,
          };
        }
      }

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
    // session.do now renders an Angular overlay inside #new-login-iframe
    // (src: angular/login/notice) — the same pattern as the security question.
    // The legacy GWT button#agreeBtn exists on the main page but dispatching
    // a click to it does not trigger navigation (the Angular app ignores it).
    // Try the Angular iframe first; fall back to the GWT button.
    if (page.url().includes("session.do")) {
      console.log("[doLoginSteps] Step 3: FCRA notice (session.do) — clicking I Agree...");
      let agreedViaAngular = false;
      try {
        const noticeFrame = page.frameLocator(LOGIN_FRAME_ID_SEL);
        // Try common Angular button patterns — getByText is most robust since
        // we don't know the exact component ID without live DOM inspection.
        // The fadv-button host wraps a <button>; Playwright pierces shadow DOM.
        const agreeLocator = noticeFrame.getByRole("button", { name: /agree/i });
        await agreeLocator.waitFor({ state: "visible", timeout: 8_000 });
        await agreeLocator.click({ force: true });
        agreedViaAngular = true;
        console.log("[doLoginSteps] Step 3: Clicked I Agree via Angular iframe (getByRole)");
      } catch {
        console.log("[doLoginSteps] Step 3: Angular iframe approach failed — trying GWT fallback");
      }

      if (!agreedViaAngular) {
        // GWT fallback: hidden button on the main page
        await page.waitForSelector(SEL_AGREE_BUTTON, { state: "attached", timeout: NAV_TIMEOUT_MS });
        await page.locator(SEL_AGREE_BUTTON).dispatchEvent("click");
        console.log("[doLoginSteps] Step 3: Clicked I Agree via GWT agreeBtn (dispatchEvent)");
      }

      // Wait for navigation away from session.do
      try {
        await page.waitForURL(
          (url) => !url.toString().includes("session.do"),
          { timeout: LOGIN_TIMEOUT_MS }
        );
      } catch {
        console.warn("[doLoginSteps] Step 3: navigation away from session.do timed out, URL:", page.url().split("?")[0]);
      }
      try { await page.waitForLoadState("networkidle", { timeout: 8_000 }); } catch {}
      console.log("[doLoginSteps] Step 3: settled URL =", page.url().split("?")[0]);
    }

    // ── Late catch-all: Session Override can appear after ANY login step ────
    // Observed in prod (2026-03): FADV shows Session Override AFTER the security
    // question is submitted, not only after the login form.  The security-question
    // waitForURL(!secretQuestion) fires when the page moves to userLogin.do?type=ee,
    // the secretQuestion check passes (URL changed), but we never handle the
    // Session Override — we just fall through to "Did not reach dashboard".
    //
    // This catch-all runs whenever we're still on userLogin.do at this point,
    // regardless of which earlier step triggered the redirect.
    if (page.url().includes("userLogin.do")) {
      console.log("[doLoginSteps] Late catch: URL is still userLogin.do — checking for Session Override...");
      const lateSessionOverride = await page.evaluate(() => {
        const iframe = document.getElementById("new-login-iframe") as HTMLIFrameElement | null;
        const s = iframe?.src ?? ""; return !!(s.includes("session-override") || s.includes("Session%20Override"));
      }).catch(() => false);

      if (lateSessionOverride) {
        console.log("[doLoginSteps] Late catch: Session Override confirmed — clicking Proceed...");
        const lateFrame = page.frameLocator(LOGIN_FRAME_ID_SEL);
        // Give Angular time to render the button
        try {
          await lateFrame.locator(SEL_SESSION_OVERRIDE_PROCEED).waitFor({ state: "visible", timeout: 15_000 });
        } catch {
          // proceed regardless
        }

        let lateClickMethod = "(none)";
        try {
          await lateFrame.locator(`${SEL_SESSION_OVERRIDE_PROCEED} >> pierce=button.button__interior`).click({ timeout: 10_000 });
          lateClickMethod = "pierce";
        } catch {
          try {
            await lateFrame.locator(`${SEL_SESSION_OVERRIDE_PROCEED} button.button__interior`).click({ timeout: 10_000 });
            lateClickMethod = "CSS-pierce";
          } catch {
            try {
              await lateFrame.locator(SEL_SESSION_OVERRIDE_PROCEED).click({ force: true, timeout: 5_000 });
              lateClickMethod = "host";
            } catch {
              try {
                await lateFrame.getByText("Proceed").click({ force: true, timeout: 5_000 });
                lateClickMethod = "getByText";
              } catch (eLate) {
                lateClickMethod = "ALL FAILED";
                console.error("[doLoginSteps] Late catch: ALL Proceed clicks failed:", eLate instanceof Error ? eLate.message : String(eLate));
              }
            }
          }
        }
        console.log("[doLoginSteps] Late catch: click method →", lateClickMethod);

        // Wait for navigation away from the login page and stabilise
        try {
          await page.waitForURL(
            (url) => !url.toString().includes("userLogin.do"),
            { timeout: LOGIN_TIMEOUT_MS }
          );
        } catch {
          console.warn("[doLoginSteps] Late catch: navigation after Proceed timed out, URL:", page.url().split("?")[0]);
        }
        try {
          await page.waitForLoadState("networkidle", { timeout: 8_000 });
        } catch {}
        console.log("[doLoginSteps] Late catch: settled URL =", page.url().split("?")[0]);

        // Handle any intermediate pages that may follow the late Proceed click
        if (page.url().includes("disclaimerNew.jsp")) {
          console.log("[doLoginSteps] Late catch: disclaimerNew.jsp — clicking I Agree...");
          await page.waitForSelector(SEL_AGREE_BUTTON, { state: "attached", timeout: NAV_TIMEOUT_MS });
          await page.locator(SEL_AGREE_BUTTON).dispatchEvent("click");
          try {
            await page.waitForURL(
              (url) => !url.toString().includes("disclaimerNew.jsp"),
              { timeout: LOGIN_TIMEOUT_MS }
            );
          } catch {}
          console.log("[doLoginSteps] Late catch: post-disclaimer URL:", page.url().split("?")[0]);
        }
        if (page.url().includes("session.do")) {
          console.log("[doLoginSteps] Late catch: session.do — clicking I Agree...");
          await page.waitForSelector(SEL_AGREE_BUTTON, { state: "attached", timeout: NAV_TIMEOUT_MS });
          await page.locator(SEL_AGREE_BUTTON).dispatchEvent("click");
          await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
          console.log("[doLoginSteps] Late catch: post-session.do URL:", page.url().split("?")[0]);
        }
      } else {
        console.warn("[doLoginSteps] Late catch: URL is userLogin.do but NOT session-override (credentials may have been rejected)");
      }
    }

    // ── Verify we reached the dashboard ────────────────────────────────────
    if (!page.url().includes("shell.jsp")) {
      const pageTitle = await page.title().catch(() => "(unknown)");
      const bodyText = await page.evaluate(() =>
        (document.body?.innerText || "").slice(0, 500)
      ).catch(() => "(could not read body)");
      console.error("[doLoginSteps] Final: did NOT reach shell.jsp", {
        url: page.url(),
        title: pageTitle,
        bodyPreview: bodyText,
      });
      return {
        success: false,
        errorType: "layout_change",
        message: `Did not reach dashboard. URL: ${page.url()} | Title: ${pageTitle} | Body: ${bodyText.slice(0, 200)}`,
      };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const currentUrl = await page.url?.() ?? "(no page)";
    const pageTitle = await page.title?.().catch(() => "(unknown)") ?? "(unknown)";
    console.error("[doLoginSteps] Caught exception", {
      error: message,
      url: currentUrl,
      title: pageTitle,
    });
    if (message.includes("Timeout") || message.includes("timeout")) {
      return {
        success: false,
        errorType: "network_error",
        message: `Timeout during FADV login at ${currentUrl}: ${message}`,
      };
    }
    return {
      success: false,
      errorType: "layout_change",
      message: `Error during login at ${currentUrl}: ${message}`,
    };
  }
}
