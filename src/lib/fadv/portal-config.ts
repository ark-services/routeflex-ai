/**
 * FADV Portal Configuration
 *
 * All portal URLs and DOM selectors — discovered via live portal inspection
 * on 2026-02-21. Selectors use stable HTML attributes (name=, id=) rather
 * than GWT-generated obfuscated class names wherever possible.
 */

// ---------------------------------------------------------------------------
// Portal entry point
// ---------------------------------------------------------------------------

export const FADV_PORTAL_URL =
  process.env.FADV_PORTAL_URL ?? "https://enterprise.fadv.com/pub/l/login/userLogin.do";

// ---------------------------------------------------------------------------
// Login page — Step 1  (https://enterprise.fadv.com/)
// Form POSTs to /pub/l/login/userLogin.do
// The login form is rendered inside an iframe named "new-login-iframe".
// ---------------------------------------------------------------------------

/** Name of the iframe that contains the login form. */
export const LOGIN_FRAME_NAME = "new-login-iframe";

/**
 * CSS selector for the login iframe (by id attribute).
 * Use with page.frameLocator() — NOT page.frame({ name }).
 *
 * NOTE: The iframe's `name` attribute is null and its `name` JS property is "".
 * page.frame({ name: "new-login-iframe" }) always returns null.
 * The iframe is only locatable by its `id` attribute.
 */
export const LOGIN_FRAME_ID_SEL = "#new-login-iframe";

/**
 * Session Override "Proceed" button.
 * This is a <fadv-button> Web Component (Lit, Shadow DOM) — NOT a native <button>.
 * Selectors targeting `button` elements will find nothing; target the host element by id.
 */
export const SEL_SESSION_OVERRIDE_PROCEED = "fadv-button#login-proceed-button";

export const SEL_CLIENT_ID    = 'input[name="accountnumber"]';
export const SEL_USER_ID      = 'input[name="username"]';
export const SEL_PASSWORD     = 'input[name="password"]';
export const SEL_LOGIN_SUBMIT = "button#signOn";

// ---------------------------------------------------------------------------
// Angular login page — /pub/l/angular/login (new UI, shadow-DOM components)
// Inputs are <fadv-input> web components with stable IDs. Playwright's CSS
// selector engine pierces shadow DOM, so appending ' input' resolves the
// actual <input> inside each component.
// Submit is a <fadv-button> web component; click targets the inner <button>.
// ---------------------------------------------------------------------------

export const SEL_ANG_CLIENT_ID    = "#login-client-id-input";
export const SEL_ANG_USER_ID      = "#login-user-id-input";
export const SEL_ANG_PASSWORD     = "#login-password-input";
export const SEL_ANG_LOGIN_SUBMIT = "#login-button";

// ---------------------------------------------------------------------------
// Security question page — Step 2  (/pub/l/login/secretQuestion.do)
// Only appears when there is no active browser session.
// Detected by URL containing "secretQuestion".
// ---------------------------------------------------------------------------

/** The security answer input (rendered as type="password" by FADV). */
export const SEL_SECURITY_ANSWER = 'input[name="answer"]';
export const SEL_SECURITY_SUBMIT = "button#submitBtn";

// ---------------------------------------------------------------------------
// FCRA notice page — Step 3  (/pub/l/login/session.do)
// Always appears after the security question step.
// Detected by URL containing "session.do".
// ---------------------------------------------------------------------------

export const SEL_AGREE_BUTTON = "button#agreeBtn";

// ---------------------------------------------------------------------------
// Dashboard  (/pub/l/shell/shell.jsp)
// Detected by URL containing "shell.jsp".
// ---------------------------------------------------------------------------

/** Top-level "Profile Advantage" nav link that expands the sub-menu. */
export const SEL_NAV_PROFILE_ADVANTAGE = "a.header";

// The "New Subject" sub-menu item is located by its text content after
// expanding the Profile Advantage nav — use page.getByText('New Subject').

// ---------------------------------------------------------------------------
// New Subject form  (loaded dynamically inside shell.jsp via GWT)
// Selectors use stable CDC_NEW_SUBJECT_* IDs where available.
// IDs with spaces/dots must use attribute-selector syntax: [id="..."]
// ---------------------------------------------------------------------------

export const SEL_FIRST_NAME   = "#CDC_NEW_SUBJECT_FIRST_NAME";
export const SEL_LAST_NAME    = "#CDC_NEW_SUBJECT_LAST_NAME";
export const SEL_EMAIL        = "#CDC_NEW_SUBJECT_EMAIL_ADDRESS";

/**
 * CSP ID dropdown. ID contains a dot so attribute-selector syntax is required.
 * The option value equals the CSP ID string (e.g. "V0021753").
 */
export const SEL_CSP_ID       = '[id="Order.Info.RefID3"]';

/**
 * Package dropdown. Option values are numeric codes (e.g. "2536").
 * Accepts both numeric code (by value) and display label (by label).
 */
export const SEL_PACKAGE      = "#CDC_NEW_SUBJECT_PACKAGE_LABEL";

/**
 * Custom "Select From Drop Down" section — IDs contain spaces.
 * Option values are the full display strings (e.g. "300 - ISP Pickup & Delivery").
 */
export const SEL_COMPANY_ID   = '[id="Company ID"]';
export const SEL_FACILITY_ID  = '[id="Facility ID"]';
export const SEL_POSITION_TYPE = '[id="Position Type"]';

/**
 * Submit button. GWT renders it as a <td class="html-face"> containing "Send".
 * In Playwright: page.locator('td.html-face').filter({ hasText: /^Send$/ })
 */
export const SEL_SEND_BUTTON_TEXT = "Send";

// ---------------------------------------------------------------------------
// Timeouts (milliseconds)
// ---------------------------------------------------------------------------

export const NAV_TIMEOUT_MS    = 30_000;
export const LOGIN_TIMEOUT_MS  = 30_000;
export const SUBMIT_TIMEOUT_MS = 45_000;
