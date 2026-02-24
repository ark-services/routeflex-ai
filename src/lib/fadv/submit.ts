/**
 * FADV (First Advantage) submission logic.
 *
 * Validates both company-level config (CSP ID, Company ID) and
 * applicant-level fields (package, location, facility_id, position_type)
 * before proceeding to create a subject/order in FADV.
 *
 * Logs distinct activity events for missing-config vs missing-applicant-fields.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import { logActivityEvent } from "@/lib/activity/logActivityEvent";
import { doLoginSteps } from "./login";
import { launchFadvContext, saveFadvCookies } from "./browser";
import { loadDbCookies, saveDbCookies } from "./cookie-store";
import {
  SEL_FIRST_NAME,
  SEL_LAST_NAME,
  SEL_EMAIL,
  SEL_CC_RECRUITER_INVITATION,
  SEL_CSP_ID,
  SEL_PACKAGE,
  SEL_COMPANY_ID,
  SEL_FACILITY_ID,
  SEL_POSITION_TYPE,
  SEL_NAV_PROFILE_ADVANTAGE,
  SEL_SEND_BUTTON_TEXT,
  NAV_TIMEOUT_MS,
  SUBMIT_TIMEOUT_MS,
} from "./portal-config";

// ── types ─────────────────────────────────────────────────────────────────────

export interface FadvApplicantFields {
  package: string;
  location: string;
  facility_id: string;
  position_type: string;
}

export interface FadvSubmissionResult {
  success: boolean;
  error?: string;
  /** FADV Subject ID returned on success */
  subjectId?: string;
}

// ── loadFadvConfig ────────────────────────────────────────────────────────────

export async function loadFadvConfig(
  supabase: SupabaseClient,
  companyId: string
): Promise<
  | {
      ok: true;
      cspId: string;
      companyIdValue: string;
      clientId: string;
      username: string | null;
      encryptedPassword: string | null;
      encryptedSecurityAnswer: string | null;
    }
  | { ok: false; reason: string }
> {
  const { data, error } = await supabase
    .from("fadv_connections")
    .select(
      "csp_id, company_id_value, client_id, username, encrypted_password, encrypted_security_answer, is_enabled"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("[loadFadvConfig] DB error:", error);
    return { ok: false, reason: "Failed to load FADV configuration" };
  }

  if (!data) {
    return { ok: false, reason: "First Advantage integration is not configured" };
  }

  if (!data.is_enabled) {
    return { ok: false, reason: "First Advantage integration is disabled" };
  }

  if (!data.csp_id?.trim() || !data.company_id_value?.trim()) {
    return {
      ok: false,
      reason: "First Advantage integration not configured (CSP ID / Company ID missing)",
    };
  }

  return {
    ok: true,
    cspId: data.csp_id.trim(),
    companyIdValue: data.company_id_value.trim(),
    clientId: (data.client_id ?? "").trim(),
    username: data.username ?? null,
    encryptedPassword: data.encrypted_password ?? null,
    encryptedSecurityAnswer: data.encrypted_security_answer ?? null,
  };
}

// ── loadApplicantFadvFields ───────────────────────────────────────────────────

export async function loadApplicantFadvFields(
  supabase: SupabaseClient,
  applicantId: string
): Promise<
  | { ok: true; fields: FadvApplicantFields }
  | { ok: false; missing: string[] }
> {
  const { data, error } = await supabase
    .from("applicant_integration_fields")
    .select("fields")
    .eq("applicant_id", applicantId)
    .eq("provider", "fadv")
    .maybeSingle();

  if (error) {
    console.error("[loadApplicantFadvFields] DB error:", error);
    return { ok: false, missing: ["package", "location", "facility_id", "position_type"] };
  }

  const fields = (data?.fields ?? {}) as Record<string, string>;

  const required: Array<keyof FadvApplicantFields> = [
    "package",
    "location",
    "facility_id",
    "position_type",
  ];

  const missing = required.filter(
    (k) => !fields[k] || String(fields[k]).trim() === ""
  );

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return {
    ok: true,
    fields: {
      package:       fields.package.trim(),
      location:      fields.location.trim(),
      facility_id:   fields.facility_id.trim(),
      position_type: fields.position_type.trim(),
    },
  };
}

// ── submitToFadv ──────────────────────────────────────────────────────────────

export async function submitToFadv(
  supabase: SupabaseClient,
  {
    companyId,
    jobId,
    applicantId,
    actorUserId,
  }: {
    companyId: string;
    jobId: string;
    applicantId: string;
    actorUserId?: string | null;
  }
): Promise<FadvSubmissionResult> {
  // ── 1. Load company-level FADV config ──────────────────────────────────────
  const configResult = await loadFadvConfig(supabase, companyId);

  if (!configResult.ok) {
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: actorUserId ?? null,
      actorType: actorUserId ? "user" : "system",
      eventType: "fadv.submission.missing_company_config",
      entityType: "applicant",
      entityId: applicantId,
      summary: `FADV submission blocked: ${configResult.reason}`,
      data: { applicant_id: applicantId, reason: configResult.reason },
    });

    return { success: false, error: configResult.reason };
  }

  // ── 2. Load applicant row (name, email, phone) ─────────────────────────────
  const { data: applicant, error: appError } = await supabase
    .from("applicants")
    .select("full_name, email, phone")
    .eq("id", applicantId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (appError || !applicant) {
    return {
      success: false,
      error: "Applicant not found or access denied",
    };
  }

  // ── 3. Load applicant-level FADV fields ────────────────────────────────────
  const fieldsResult = await loadApplicantFadvFields(supabase, applicantId);

  if (!fieldsResult.ok) {
    const missingLabels = fieldsResult.missing.map((k) =>
      k === "facility_id"
        ? "Facility ID"
        : k === "position_type"
        ? "Position Type"
        : k.charAt(0).toUpperCase() + k.slice(1)
    );

    const errorMsg = `Missing required applicant fields: ${missingLabels.join(", ")}`;

    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: actorUserId ?? null,
      actorType: actorUserId ? "user" : "system",
      eventType: "fadv.submission.missing_applicant_fields",
      entityType: "applicant",
      entityId: applicantId,
      summary: `FADV submission blocked: ${errorMsg}`,
      data: {
        applicant_id: applicantId,
        missing_fields: fieldsResult.missing,
      },
    });

    return { success: false, error: errorMsg };
  }

  // ── 4. All required data present — proceed to create subject in FADV ───────
  const { cspId, companyIdValue } = configResult;
  const { fields } = fieldsResult;

  // Parse name
  const nameParts = (applicant.full_name ?? "").trim().split(/\s+/);
  const firstName = nameParts[0] ?? "";
  const lastName = (nameParts.slice(1).join(" ") || nameParts[0]) ?? "";

  console.log("[submitToFadv] Submitting to FADV:", {
    cspId,
    companyIdValue,
    firstName,
    lastName,
    email: applicant.email,
    phone: applicant.phone,
    package: fields.package,
    location: fields.location,
    facilityId: fields.facility_id,
    positionType: fields.position_type,
  });

  // ── 4a. Decrypt login credentials ─────────────────────────────────────────
  let password: string | null = null;
  if (configResult.encryptedPassword) {
    try {
      password = decrypt(configResult.encryptedPassword);
    } catch {
      return { success: false, error: "Failed to decrypt FADV password" };
    }
  }

  let securityAnswer: string | null = null;
  if (configResult.encryptedSecurityAnswer) {
    try {
      securityAnswer = decrypt(configResult.encryptedSecurityAnswer);
    } catch {
      return { success: false, error: "Failed to decrypt FADV security answer" };
    }
  }

  // TODO: Replace with actual FADV API call when credentials are finalized.
  // The FADV "Create Subject" API endpoint and auth mechanism are external
  // and will be wired up separately. The validation and field gathering above
  // is production-ready.
  const fadvResult = await callFadvCreateSubject({
    cspId,
    companyIdValue,
    clientId: configResult.clientId,
    firstName,
    lastName,
    email: applicant.email ?? "",
    phone: applicant.phone ?? "",
    packageCode: fields.package,
    location: fields.location,
    facilityId: fields.facility_id,
    positionType: fields.position_type,
    username: configResult.username,
    password,
    securityAnswer,
  });

  if (!fadvResult.success) {
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: actorUserId ?? null,
      actorType: actorUserId ? "user" : "system",
      eventType: "fadv.submission.failed",
      entityType: "applicant",
      entityId: applicantId,
      summary: `FADV submission failed: ${fadvResult.error}`,
      data: {
        applicant_id: applicantId,
        error: fadvResult.error,
        csp_id: cspId,
        company_id_value: companyIdValue,
      },
    });

    return { success: false, error: fadvResult.error };
  }

  await logActivityEvent(supabase, {
    companyId,
    jobId,
    actorUserId: actorUserId ?? null,
    actorType: actorUserId ? "user" : "system",
    eventType: "fadv.submission.success",
    entityType: "applicant",
    entityId: applicantId,
    summary: `Applicant sent to First Advantage${fadvResult.subjectId ? ` (Subject ID: ${fadvResult.subjectId})` : ""}`,
    data: {
      applicant_id: applicantId,
      subject_id: fadvResult.subjectId ?? null,
      csp_id: cspId,
      company_id_value: companyIdValue,
      package: fields.package,
      location: fields.location,
      facility_id: fields.facility_id,
      position_type: fields.position_type,
    },
  });

  return { success: true, subjectId: fadvResult.subjectId };
}

// ── runFadvApiCall ────────────────────────────────────────────────────────────
// Exported entry-point used by the queue processor (process-queue route).
// Accepts the pre-validated field values without requiring `location`
// (the column-mapping automation flow does not map a location column).

export interface FadvApiCallParams {
  cspId: string;
  companyIdValue: string;
  clientId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  packageCode: string;
  facilityId: string;
  positionType: string;
  username: string | null;
  /** Decrypted password — NEVER log */
  password: string | null;
  /** Decrypted security answer — NEVER log */
  securityAnswer: string | null;
  /**
   * Supabase company UUID. When provided, session cookies are loaded from the
   * database before launching the browser (cold-start fallback) and saved back
   * after a successful login (for serverless resilience).
   */
  companyId?: string;
}

export async function runFadvApiCall(
  params: FadvApiCallParams
): Promise<{ success: boolean; subjectId?: string; error?: string }> {
  return callFadvCreateSubject({
    cspId:          params.cspId,
    companyIdValue: params.companyIdValue,
    clientId:       params.clientId,
    firstName:      params.firstName,
    lastName:       params.lastName,
    email:          params.email,
    phone:          params.phone,
    packageCode:    params.packageCode,
    location:       "",          // not required in column-mapping flow
    facilityId:     params.facilityId,
    positionType:   params.positionType,
    username:       params.username,
    password:       params.password,
    securityAnswer: params.securityAnswer,
    companyId:      params.companyId,
  });
}

// ── callFadvCreateSubject ─────────────────────────────────────────────────────
// Automates the FADV Enterprise Advantage portal to create a new subject.
// Launches a browser, logs in (3-step), navigates to Profile Advantage →
// New Subject, fills the form, captures the Profile ID from the confirmation
// dialog, and returns it as the subjectId.

async function callFadvCreateSubject(params: {
  cspId: string;
  companyIdValue: string;
  clientId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  packageCode: string;
  location: string;
  facilityId: string;
  positionType: string;
  username: string | null;
  /** Decrypted password — NEVER log this value */
  password: string | null;
  /** Decrypted security answer — NEVER log this value */
  securityAnswer: string | null;
  /** Supabase company UUID — enables DB cookie persistence for cold-start resilience */
  companyId?: string;
}): Promise<{ success: boolean; subjectId?: string; error?: string }> {

  if (
    !params.clientId ||
    !params.username ||
    !params.password ||
    !params.securityAnswer
  ) {
    return {
      success: false,
      error: "FADV login credentials are not fully configured (Client ID, User ID, Password, Security Answer required)",
    };
  }

  console.log("[callFadvCreateSubject] Starting FADV browser automation", {
    clientId: params.clientId,
    username: params.username,
    applicant: `${params.firstName} ${params.lastName}`,
    package: params.packageCode,
    facilityId: params.facilityId,
    positionType: params.positionType,
    // password + securityAnswer intentionally NOT logged
  });

  // Load DB cookies as a cold-start fallback (serverless: /tmp is wiped on cold start)
  const dbCookies = params.companyId ? await loadDbCookies(params.companyId) : undefined;

  // Persistent context — session cookies are saved to disk so FADV skips the
  // security question on all runs after the first (same behaviour as a real browser).
  const context = await launchFadvContext(params.clientId, dbCookies ?? undefined);
  const page    = await context.newPage();

  try {
    // ── Step 1: Login (3-step: credentials → security question → FCRA notice) ─
    const loginResult = await doLoginSteps(page, {
      clientId:       params.clientId,
      username:       params.username,
      password:       params.password,
      securityAnswer: params.securityAnswer,
    });

    if (!loginResult.success) {
      return { success: false, error: `FADV login failed: ${loginResult.message}` };
    }

    // Save session cookies so the next run skips the security question.
    // Also persist to DB for serverless cold-start resilience.
    const savedCookies = await saveFadvCookies(context, params.clientId);
    if (params.companyId && savedCookies.length > 0) {
      await saveDbCookies(params.companyId, savedCookies);
    }

    // ── Step 2: Navigate to New Subject form ───────────────────────────────────
    // Click the "Profile Advantage" top-level nav item to expand its sub-menu
    await page
      .locator(SEL_NAV_PROFILE_ADVANTAGE)
      .filter({ hasText: "Profile Advantage" })
      .click();

    // Click the "New Subject" sub-menu item
    await page.getByText("New Subject", { exact: true }).first().click();

    // Wait for the form's first required field to appear
    await page.waitForSelector(SEL_FIRST_NAME, { timeout: NAV_TIMEOUT_MS });

    // ── Step 3: Fill the form ──────────────────────────────────────────────────
    await page.fill(SEL_FIRST_NAME, params.firstName);
    await page.fill(SEL_LAST_NAME,  params.lastName);
    await page.fill(SEL_EMAIL,      params.email);

    // CSP ID — select by value (e.g. "V0021753")
    await page.selectOption(SEL_CSP_ID, { value: params.cspId });

    // Package — try by numeric value first, fall back to display label
    try {
      await page.selectOption(SEL_PACKAGE, { value: params.packageCode });
    } catch {
      await page.selectOption(SEL_PACKAGE, { label: params.packageCode });
    }

    // Custom dropdown fields (ID has spaces — use attribute selector)
    await page.selectOption(SEL_COMPANY_ID,    { value: params.companyIdValue });
    await page.selectOption(SEL_FACILITY_ID,   { value: params.facilityId });
    await page.selectOption(SEL_POSITION_TYPE, { value: params.positionType });

    // Check "CC: Recruiter on Invitation Email" AFTER all dropdowns.
    // Placed last because GWT dropdown selections can trigger server-side re-renders
    // that reset checkbox state back to unchecked.
    // Uses page.evaluate() to dispatch the exact MouseEvent that the console test
    // confirmed works: new MouseEvent('click', { bubbles:true, cancelable:true, view:window }).
    // Playwright's locator.dispatchEvent("click") does not pass bubbles:true by default,
    // which is why the previous attempt failed even though the manual test worked.
    try {
      await page.waitForSelector(SEL_CC_RECRUITER_INVITATION, { state: "attached", timeout: 10_000 });
      const checked = await page.evaluate((sel) => {
        const input = document.querySelector(sel) as HTMLInputElement | null;
        if (!input) return { found: false, checked: false };
        if (!input.checked) {
          input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        }
        return { found: true, checked: input.checked };
      }, SEL_CC_RECRUITER_INVITATION);
      console.log("[callFadvCreateSubject] CC Recruiter checkbox:", checked);
    } catch (err) {
      console.warn("[callFadvCreateSubject] Could not check CC: Recruiter on Invitation Email — continuing:", err);
    }

    // ── Step 4: Submit and capture the confirmation dialog ────────────────────
    //
    // FADV renders a GWT HTML modal after a successful Send — it is NOT a native
    // browser alert() — so page.once("dialog") never fires. The modal uses the
    // same GWT button pattern as the session-expired dialog: a <td class="html-face">
    // containing "OK". We click Send, wait for that button to appear, read the
    // dialog text, then dismiss it.
    let profileId: string | undefined;

    // Click the GWT-rendered "Send" button (a <td class="html-face"> element)
    await page
      .locator("td.html-face")
      .filter({ hasText: new RegExp(`^${SEL_SEND_BUTTON_TEXT}$`) })
      .click();

    // Wait for the GWT confirmation modal's OK button to become visible.
    const gwtOkBtn = page
      .locator("td.html-face")
      .filter({ hasText: /^OK$/ });

    try {
      await gwtOkBtn.waitFor({ state: "visible", timeout: SUBMIT_TIMEOUT_MS });
    } catch {
      throw new Error("No confirmation dialog appeared after Send — possible form validation error");
    }

    // Read the dialog body text before dismissing.
    // GWT dialogs are table-based; walk up to the nearest enclosing table to
    // capture the full message. Fall back to a generic success string.
    const dialogMessage = await gwtOkBtn
      .locator("xpath=ancestor::table[1]")
      .innerText()
      .catch(() => "Submission confirmed");
    console.log("[callFadvCreateSubject] Confirmation dialog text:", dialogMessage);

    await gwtOkBtn.click();

    // Extract Profile ID — 8–12 uppercase alphanumeric chars (e.g. "YQXIEB64ZM")
    const idMatch = dialogMessage.match(/\b([A-Z0-9]{8,12})\b/);
    if (idMatch) {
      profileId = idMatch[1];
      console.log("[callFadvCreateSubject] Profile ID captured:", profileId);
    } else {
      // Dialog appeared but didn't contain a recognisable ID — still a success
      console.warn(
        "[callFadvCreateSubject] Dialog message did not contain a Profile ID pattern.",
        "Message:", dialogMessage
      );
    }

    return { success: true, subjectId: profileId };

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[callFadvCreateSubject] Error:", message);

    if (message.includes("Timeout") || message.includes("timeout")) {
      return { success: false, error: `FADV portal timeout — ${message}` };
    }
    return { success: false, error: message };
  } finally {
    if (process.env.FADV_DEBUG_KEEP_BROWSER !== "true") {
      await context.close();
    }
  }
}
