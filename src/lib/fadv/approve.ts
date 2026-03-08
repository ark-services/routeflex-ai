/**
 * FADV "Approve Order" automation.
 *
 * Searches for an existing subject by Profile ID in the FADV portal,
 * then selects "Review & Place Order" from the Actions dropdown to
 * approve (place) the background check order.
 *
 * Reuses the same login, browser, and cookie infrastructure as
 * callFadvCreateSubject in submit.ts.
 */

import { doLoginSteps } from "./login";
import { launchFadvContext, saveFadvCookies } from "./browser";
import { loadDbCookies, saveDbCookies } from "./cookie-store";
import {
  SEL_NAV_PROFILE_ADVANTAGE,
  SEL_FIND_SUBJECT_PROFILE_ID,
  SEL_FIND_SUBJECT_SEARCH_BTN_TEXT,
  SEL_REVIEW_PLACE_ORDER_TEXT,
  NAV_TIMEOUT_MS,
  SEARCH_TIMEOUT_MS,
  ORDER_CONFIRM_TIMEOUT_MS,
} from "./portal-config";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FadvApproveParams {
  clientId: string;
  username: string | null;
  /** Decrypted password — NEVER log */
  password: string | null;
  /** Decrypted security answer — NEVER log */
  securityAnswer: string | null;
  /** The FADV Profile ID to search for */
  profileId: string;
  /** Supabase company UUID for cookie persistence */
  companyId?: string;
}

export interface FadvApproveResult {
  success: boolean;
  error?: string;
}

// ── Main function ────────────────────────────────────────────────────────────

export async function runFadvApproveOrder(
  params: FadvApproveParams
): Promise<FadvApproveResult> {
  // Validate credentials
  if (
    !params.clientId ||
    !params.username ||
    !params.password ||
    !params.securityAnswer
  ) {
    return {
      success: false,
      error:
        "FADV login credentials are not fully configured (Client ID, User ID, Password, Security Answer required)",
    };
  }

  if (!params.profileId?.trim()) {
    return {
      success: false,
      error: "Profile ID is required for FADV order approval",
    };
  }

  console.log("[runFadvApproveOrder] Starting FADV approve automation", {
    clientId: params.clientId,
    username: params.username,
    profileId: params.profileId,
    // password + securityAnswer intentionally NOT logged
  });

  // Load DB cookies as cold-start fallback (serverless: /tmp is wiped on cold start)
  const dbCookies = params.companyId
    ? await loadDbCookies(params.companyId)
    : undefined;

  const context = await launchFadvContext(
    params.clientId,
    dbCookies ?? undefined
  );
  const page = await context.newPage();

  try {
    // ── Step 1: Login (3-step: credentials → security question → FCRA notice) ─
    const loginResult = await doLoginSteps(page, {
      clientId: params.clientId,
      username: params.username,
      password: params.password,
      securityAnswer: params.securityAnswer,
    });

    if (!loginResult.success) {
      return {
        success: false,
        error: `FADV login failed: ${loginResult.message}`,
      };
    }

    // Save session cookies so the next run skips the security question.
    const savedCookies = await saveFadvCookies(context, params.clientId);
    if (params.companyId && savedCookies.length > 0) {
      await saveDbCookies(params.companyId, savedCookies);
    }

    // ── Step 2: Navigate to Profile Advantage → Find Subject ─────────────
    await page
      .locator(SEL_NAV_PROFILE_ADVANTAGE)
      .filter({ hasText: "Profile Advantage" })
      .click();

    await page.getByText("Find Subject", { exact: true }).first().click();

    // Wait for the Profile ID input to appear
    await page.waitForSelector(SEL_FIND_SUBJECT_PROFILE_ID, {
      timeout: NAV_TIMEOUT_MS,
    });

    // ── Step 3: Search by Profile ID ─────────────────────────────────────
    await page.fill(SEL_FIND_SUBJECT_PROFILE_ID, params.profileId);
    console.log(
      "[runFadvApproveOrder] Entered Profile ID:",
      params.profileId
    );

    // Click Search button (GWT td.html-face)
    await page
      .locator("td.html-face")
      .filter({ hasText: new RegExp(`^${SEL_FIND_SUBJECT_SEARCH_BTN_TEXT}$`) })
      .click();

    // Wait for search results — GWT renders rows with class "standard".
    // The subject name appears as plain text in a <td> (no <a> tag).
    // Wait for a table row with the "standard" class to appear.
    const resultRow = page.locator("tr.standard").first();

    try {
      await resultRow.waitFor({
        state: "visible",
        timeout: SEARCH_TIMEOUT_MS,
      });
    } catch {
      throw new Error(
        `No search results found for Profile ID "${params.profileId}"`
      );
    }

    // ── Step 4: Click the Subject name to navigate to the detail page ──
    // GWT CellTable renders deeply nested <table>/<td> inside each column cell.
    // resultRow.locator("td").nth(N) returns ALL td descendants (including
    // nested ones), so nth(1) was incorrectly targeting a checkbox <td>.
    //
    // The actual clickable element is a <div class="gwt-Label ... pointer">
    // containing the subject's name. The "pointer" CSS class marks it as the
    // intended click target for GWT's navigation handler.

    const subjectNameDiv = resultRow.locator("div.gwt-Label.pointer").first();
    const subjectNameText = await subjectNameDiv.innerText();
    console.log("[runFadvApproveOrder] Clicking subject name:", subjectNameText);

    await subjectNameDiv.click();
    console.log("[runFadvApproveOrder] Clicked subject name div.pointer");

    // Wait for the subject detail page to load — the Actions dropdown should appear
    // FADV renders it as <select id="CDC_SUBJECT_DETAIL_ACTIONS">
    const actionsSelect = page.locator("#CDC_SUBJECT_DETAIL_ACTIONS");
    try {
      await actionsSelect.waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS });
    } catch {
      await page.screenshot({ path: "/tmp/fadv-approve-timeout.png" });
      throw new Error(
        "Subject detail page did not load — Actions dropdown not found"
      );
    }

    // ── Step 5: Select "Review & Place Order" from Actions dropdown ──────
    await actionsSelect.selectOption({ label: SEL_REVIEW_PLACE_ORDER_TEXT });
    console.log(
      "[runFadvApproveOrder] Selected 'Review & Place Order' from Actions"
    );

    // ── Step 6: Wait for confirmation dialog ─────────────────────────────
    // FADV renders GWT HTML modals with an "OK" button (same pattern as
    // the New Subject confirmation in submit.ts)
    const gwtOkBtn = page
      .locator("td.html-face")
      .filter({ hasText: /^OK$/ });

    try {
      await gwtOkBtn.waitFor({
        state: "visible",
        timeout: ORDER_CONFIRM_TIMEOUT_MS,
      });
    } catch {
      throw new Error(
        "No confirmation dialog appeared after 'Review & Place Order'"
      );
    }

    // Read the dialog text for logging
    const dialogMessage = await gwtOkBtn
      .locator("xpath=ancestor::table[1]")
      .innerText()
      .catch(() => "Order confirmed");
    console.log(
      "[runFadvApproveOrder] Confirmation dialog:",
      dialogMessage
    );

    // Dismiss the dialog
    await gwtOkBtn.click();

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[runFadvApproveOrder] Error:", message);

    if (message.includes("Timeout") || message.includes("timeout")) {
      return {
        success: false,
        error: `FADV portal timeout — ${message}`,
      };
    }
    return { success: false, error: message };
  } finally {
    if (process.env.FADV_DEBUG_KEEP_BROWSER !== "true") {
      await context.close();
    }
  }
}
