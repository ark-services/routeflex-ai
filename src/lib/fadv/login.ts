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
      // The security answer field is input[name="answer"] rendered as type="password".
      // getByRole("textbox") does NOT match type="password" inputs — it would find
      // a different (wrong) field and submit the wrong value.
      //
      // Strategy:
      //   1. Scan main page + all frames for SEL_SECURITY_ANSWER (legacy GWT path).
      //      Also wait briefly for frames to settle before scanning.
      //   2. If not found via CSS selector, fall back to the Angular iframe path
      //      using frameLocator("#new-login-iframe") (bypasses the page.frame({ name })
      //      issue — that API always returns null for this iframe).

      type FrameOrPage = import("playwright-core").Frame | import("playwright-core").Page;

      console.log(
        "[doLoginSteps] Step 2: frames on secretQuestion page:",
        page.frames().map((f) => `"${f.name() || "(main)"}@${f.url().split("?")[0]}"`)
      );

      // Longer settle pause — Angular security-question page may still be
      // rendering when the main frame lands on secretQuestion.do.
      await new Promise<void>((r) => setTimeout(r, 2_000));

      // ── Path A: Scan all contexts for the answer input ────────────────────
      // Try two selectors in priority order:
      //   1. input[name="answer"]  — stable legacy GWT attribute
      //   2. input[type="password"] — broader fallback (FADV renders the answer
      //      as type="password" on both GWT and some Angular variants)
      let secCtx: FrameOrPage = page;
      let foundViaCss = false;
      let foundSelector = SEL_SECURITY_ANSWER;
      const allContexts: FrameOrPage[] = [page, ...page.frames()];

      for (const selector of [SEL_SECURITY_ANSWER, 'input[type="password"]']) {
        for (const ctx of allContexts) {
          const el = await ctx.$(selector).catch(() => null);
          if (el) {
            secCtx = ctx;
            foundViaCss = true;
            foundSelector = selector;
            const label = ctx === page
              ? "(main page)"
              : `frame "${(ctx as import("playwright-core").Frame).name() || "(unnamed)"}" @ ${(ctx as import("playwright-core").Frame).url().split("?")[0]}`;
            console.log(`[doLoginSteps] Step 2: answer field found via "${selector}" in ${label}`);
            break;
          }
        }
        if (foundViaCss) break;
      }

      if (foundViaCss) {
        // CSS path — fill directly into the input.
        // GWT renders the actual <input name="answer"> as hidden (display:none) behind
        // a styled GWT wrapper widget — waitForSelector with state:"visible" will never
        // resolve. Use state:"attached" (element is in DOM) then force:true to bypass
        // Playwright's visibility guard and write directly to the hidden input.
        console.log(`[doLoginSteps] Step 2: filling answer via CSS selector (${foundSelector})`);
        await secCtx.waitForSelector(foundSelector, { state: "attached", timeout: NAV_TIMEOUT_MS });
        await secCtx.locator(foundSelector).fill(params.securityAnswer, { force: true });

        // Try GWT submit button first, then generic role-based fallback.
        // SEL_SECURITY_SUBMIT (button#submitBtn) may also be hidden — use force:true.
        const hasGwtSubmit = await secCtx.$(SEL_SECURITY_SUBMIT).catch(() => null);
        const submitBtn = hasGwtSubmit
          ? secCtx.locator(SEL_SECURITY_SUBMIT)
          : secCtx.getByRole("button", { name: /submit/i });
        console.log(`[doLoginSteps] Step 2: clicking ${hasGwtSubmit ? "GWT" : "role-based"} Submit button`);
        await submitBtn.click({ force: true });
      } else {
        // ── Path B: Angular iframe via frameLocator ───────────────────────────
        // NOTE: #new-login-iframe only exists on userLogin.do. On secretQuestion.do
        // FADV may render the form directly on the main page (no iframe wrapper).
        // Try the iframe first with a short timeout, then fall back to the main page.
        console.log("[doLoginSteps] Step 2: CSS selector not found — trying Angular iframe, then main page");

        let filledViaIframe = false;
        try {
          const iframeCtx = page.frameLocator(LOGIN_FRAME_ID_SEL);
          await iframeCtx.getByRole("textbox").first().waitFor({ state: "visible", timeout: 8_000 });
          console.log("[doLoginSteps] Step 2: answer textbox visible in Angular iframe");
          await iframeCtx.getByRole("textbox").first().click();
          await iframeCtx.getByRole("textbox").first().pressSequentially(params.securityAnswer, { delay: 50 });
          const submitBtn = iframeCtx.getByRole("button", { name: /submit/i });
          try {
            await submitBtn.waitFor({ state: "visible", timeout: 5_000 });
          } catch {
            console.warn("[doLoginSteps] Step 2: iframe Submit button not visible after 5s — clicking anyway");
          }
          await submitBtn.click({ force: true });
          filledViaIframe = true;
        } catch {
          console.warn("[doLoginSteps] Step 2: Angular iframe not found or timed out — trying main page textbox");
        }

        if (!filledViaIframe) {
          // Last resort: security question form is directly on the main page.
          try {
            await page.getByRole("textbox").first().waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS });
            console.log("[doLoginSteps] Step 2: answer textbox visible on main page");
            await page.getByRole("textbox").first().click();
            await page.getByRole("textbox").first().pressSequentially(params.securityAnswer, { delay: 50 });
            const submitBtn = page.getByRole("button", { name: /submit/i });
            try {
              await submitBtn.waitFor({ state: "visible", timeout: 5_000 });
            } catch {
              console.warn("[doLoginSteps] Step 2: main page Submit button not visible — clicking anyway");
            }
            await submitBtn.click({ force: true });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("[doLoginSteps] Step 2: no answer input found anywhere on page", { url: page.url(), error: msg });
            return {
              success: false,
              errorType: "layout_change",
              message: `Security question input not found. FADV may have changed its page structure. URL: ${page.url()}`,
            };
          }
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
    if (page.url().includes("session.do")) {
      await page.waitForSelector(SEL_AGREE_BUTTON, { state: "attached", timeout: NAV_TIMEOUT_MS });
      await page.locator(SEL_AGREE_BUTTON).dispatchEvent("click");
      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
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
