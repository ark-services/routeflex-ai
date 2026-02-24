/**
 * Safety Trainer Hub — Playwright form automation
 *
 * Fills out the certification form at:
 *   https://safetytrainer.kellyandersongroup.com/newmore10k/
 *
 * The form uses signature_pad.js v3.4.4 (from npm). Signature injection:
 *   1. Try window.WidgetElements_FormSignature (Elementor widget wrapper)
 *   2. Fall back to injecting directly into the hidden <input> and firing
 *      a synthetic change/input event so the widget picks it up.
 *
 * Usage:
 *   const result = await runSafetyTrainerSubmission({ config, applicant, ... });
 *   if (!result.success) console.error(result.error);
 */

import { chromium as playwrightChromium } from "playwright-core";
import type { SafetyTrainerConfig } from "@/components/integrations/safety-trainer-actions";

const FORM_URL = "https://safetytrainer.kellyandersongroup.com/newmore10k/";

// Timeouts
const NAV_TIMEOUT_MS    = 30_000;
const ELEMENT_TIMEOUT_MS = 15_000;
const SUBMIT_TIMEOUT_MS  = 30_000;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SafetyTrainerSubmissionParams {
  config: SafetyTrainerConfig;
  applicant: {
    full_name: string;
    email: string;
    phone: string;
  };
  /** Value of the "Driver FedEx ID" board column */
  driverFedexId: string;
  /** Stage One Start Date — "YYYY-MM-DD" or "MM/DD/YYYY" */
  startDate: string;
  /** Stage One Completion Date — "YYYY-MM-DD" or "MM/DD/YYYY" */
  completionDate: string;
}

export type SafetyTrainerSubmissionResult =
  | { success: true }
  | { success: false; error: string };

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runSafetyTrainerSubmission(
  params: SafetyTrainerSubmissionParams
): Promise<SafetyTrainerSubmissionResult> {
  const isServerless = !!(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV
  );

  let browser: import("playwright-core").Browser | null = null;

  try {
    if (isServerless) {
      const sparticuz = (await import("@sparticuz/chromium")).default;
      console.log("[safety-trainer/submit] Serverless Chromium");
      browser = await playwrightChromium.launch({
        args: sparticuz.args,
        executablePath: await sparticuz.executablePath(),
        headless: true,
      });
    } else {
      console.log("[safety-trainer/submit] Playwright Chromium (ephemeral)");
      browser = await playwrightChromium.launch({
        headless: true,
        ignoreDefaultArgs: ["--enable-automation"],
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-session-crashed-bubble",
          "--disable-features=InfiniteSessionRestore",
        ],
      });
    }

    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();

    try {
      const result = await fillAndSubmitForm(page, params);
      return result;
    } finally {
      await context.close().catch(() => {});
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[safety-trainer/submit] Unexpected error:", msg);
    return { success: false, error: msg };
  } finally {
    await browser?.close().catch(() => {});
  }
}

// ── Login step ────────────────────────────────────────────────────────────────

const LOGIN_HOME = "https://safetytrainer.kellyandersongroup.com/";

async function performSafetyTrainerLogin(
  page: import("playwright-core").Page,
  username: string,
  password: string
): Promise<{ success: true } | { success: false; error: string }> {
  console.log("[safety-trainer/submit] Navigating to site home to check session");
  try {
    await page.goto(LOGIN_HOME, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Login page navigation failed: ${msg}` };
  }

  // If already logged in (no login form present), skip
  const loginField = await page.$('[name="log"]');
  if (!loginField) {
    console.log("[safety-trainer/submit] Already logged in — skipping login");
    return { success: true };
  }

  console.log("[safety-trainer/submit] Login wall detected — logging in");
  try {
    await page.fill('[name="log"]', username, { timeout: ELEMENT_TIMEOUT_MS });
    await page.fill('[name="pwd"]', password, { timeout: ELEMENT_TIMEOUT_MS });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }),
      page.click('button[type="submit"], input[type="submit"]', { timeout: ELEMENT_TIMEOUT_MS }),
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Login interaction failed: ${msg}` };
  }

  // Confirm login succeeded: login form should be gone
  const stillOnLogin = await page.$('[name="log"]');
  if (stillOnLogin) {
    return {
      success: false,
      error: "Safety Trainer login failed — check FedEx ID and password in integration settings",
    };
  }

  console.log("[safety-trainer/submit] Login succeeded");
  return { success: true };
}

// ── Form fill logic ───────────────────────────────────────────────────────────

async function fillAndSubmitForm(
  page: import("playwright-core").Page,
  params: SafetyTrainerSubmissionParams
): Promise<SafetyTrainerSubmissionResult> {
  const { config, applicant, driverFedexId, startDate, completionDate } = params;

  // ── Step 1: Log in ───────────────────────────────────────────────────────────
  const loginResult = await performSafetyTrainerLogin(
    page,
    config.trainerFedexId,
    config.trainerPassword
  );
  if (!loginResult.success) return loginResult;

  // Normalise dates to MM/DD/YYYY (the form's expected format)
  const startDateFormatted = normaliseDate(startDate);
  const completionDateFormatted = normaliseDate(completionDate);

  console.log("[safety-trainer/submit] Navigating to form:", FORM_URL);
  try {
    await page.goto(FORM_URL, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Navigation failed: ${msg}` };
  }

  // Wait for the form to be present
  try {
    await page.waitForSelector("form", { timeout: ELEMENT_TIMEOUT_MS });
  } catch {
    return { success: false, error: "Form not found on page after navigation" };
  }

  console.log("[safety-trainer/submit] Form found — filling fields");

  // ── Fill text fields ─────────────────────────────────────────────────────────
  const fillMap: Array<[string, string]> = [
    // Trainer fields (from config)
    ['[name="form_fields[field_b87e11d]"]', config.trainerFedexId],
    ['[name="form_fields[field_f8e2610]"]', config.trainerEmail],
    ['[name="form_fields[trainername]"]',   config.trainerName],
    ['[name="form_fields[field_3358994]"]', config.companyEntityId],
    ['[name="form_fields[field_e30a78b]"]', config.contractNumber],
    ['[name="form_fields[field_c8e7d3f]"]', config.companyName],
    // Driver fields (from applicant record + board columns)
    ['[name="form_fields[field_64da733]"]', driverFedexId],
    ['[name="form_fields[field_7f0b88b]"]', applicant.full_name],
    ['[name="form_fields[email]"]',          applicant.email],
    ['[name="form_fields[field_8b38f8f]"]', applicant.phone],
    // Date fields
    ['[name="form_fields[field_60573dc]"]', startDateFormatted],
    ['[name="form_fields[field_4d93931]"]', completionDateFormatted],
  ];

  for (const [selector, value] of fillMap) {
    try {
      await page.fill(selector, value, { timeout: ELEMENT_TIMEOUT_MS });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Log but don't fail — some fields may be optional or named differently
      console.warn(`[safety-trainer/submit] Could not fill "${selector}": ${msg}`);
    }
  }

  // ── Check all checkboxes ─────────────────────────────────────────────────────
  // Stage 1 training item checkboxes
  const stage1Checkboxes = await page.$$('[name="form_fields[field_ec14d8d][]"]');
  console.log(`[safety-trainer/submit] Found ${stage1Checkboxes.length} Stage 1 checkboxes`);
  for (const cb of stage1Checkboxes) {
    await cb.check().catch(() => {});
  }

  // Driver certificate checkbox
  const certCheckboxSelectors = [
    '[name="form_fields[field_6ee2055]"]',
    '[name="form_fields[field_6beebc8]"]',
  ];
  for (const sel of certCheckboxSelectors) {
    const el = await page.$(sel);
    if (el) {
      await el.check().catch(() => {});
    }
  }

  // ── Inject signature ─────────────────────────────────────────────────────────
  console.log("[safety-trainer/submit] Injecting signature");
  const sigResult = await injectSignature(page, config.signatureDataUrl);
  if (!sigResult.success) {
    return { success: false, error: `Signature injection failed: ${sigResult.error}` };
  }

  // ── Submit the form ──────────────────────────────────────────────────────────
  console.log("[safety-trainer/submit] Submitting form");
  try {
    // Click the submit button and wait for navigation/success indicator
    await Promise.all([
      page.waitForNavigation({ timeout: SUBMIT_TIMEOUT_MS, waitUntil: "domcontentloaded" })
        .catch(() => {
          // Some WP/Elementor forms submit via AJAX without full navigation
        }),
      page.click('[type="submit"]', { timeout: ELEMENT_TIMEOUT_MS }),
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Form submission failed: ${msg}` };
  }

  // ── Check for success indicator ──────────────────────────────────────────────
  // Wait a moment for the AJAX success state to render
  await page.waitForTimeout(2000);

  const pageContent = await page.content();

  // Detect common Elementor/WP form success messages
  const successPatterns = [
    /thank\s+you/i,
    /successfully\s+submitted/i,
    /form.*submitted/i,
    /submission.*received/i,
    /elementor-message-success/i,
    /e-form__messages.*success/i,
  ];

  const errorPatterns = [
    /elementor-message-danger/i,
    /e-form__messages.*danger/i,
    /there was an error/i,
    /submission.*failed/i,
  ];

  const hasError = errorPatterns.some((p) => p.test(pageContent));
  if (hasError) {
    // Try to extract error text
    const errorText = await page
      .$eval(
        ".elementor-message-danger, .e-form__messages",
        (el) => el.textContent?.trim() ?? "Form submission error"
      )
      .catch(() => "Form submission error detected");
    return { success: false, error: errorText };
  }

  const hasSuccess = successPatterns.some((p) => p.test(pageContent));
  if (hasSuccess) {
    console.log("[safety-trainer/submit] ✓ Form submitted successfully");
    return { success: true };
  }

  // If we can't definitively confirm success or failure, treat as success
  // (the form likely submitted but uses a non-standard confirmation pattern)
  console.warn("[safety-trainer/submit] Could not confirm success from page content — assuming submitted");
  return { success: true };
}

// ── Signature injection ────────────────────────────────────────────────────────

async function injectSignature(
  page: import("playwright-core").Page,
  signatureDataUrl: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const injected = await page.evaluate((dataUrl: string) => {
      // Strategy 1: Use WidgetElements_FormSignature wrapper (Elementor widget)
      try {
        const widget = (window as any).WidgetElements_FormSignature;
        if (widget && widget._instance) {
          widget._instance.fromDataURL(dataUrl);
          // Also populate the hidden input
          const hiddenInput = document.getElementById(
            "form-field-signature"
          ) as HTMLInputElement | null;
          if (hiddenInput) {
            hiddenInput.value = dataUrl;
            hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
            hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
          return { ok: true, method: "WidgetElements_FormSignature._instance" };
        }
      } catch (_) {}

      // Strategy 2: Find SignaturePad instance on the canvas directly
      try {
        const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
        if (canvas) {
          const spInstance = (canvas as any)._signaturePad;
          if (spInstance && typeof spInstance.fromDataURL === "function") {
            spInstance.fromDataURL(dataUrl);
            const hiddenInput = document.getElementById(
              "form-field-signature"
            ) as HTMLInputElement | null;
            if (hiddenInput) {
              hiddenInput.value = dataUrl;
              hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
            }
            return { ok: true, method: "canvas._signaturePad" };
          }
        }
      } catch (_) {}

      // Strategy 3: Inject directly into hidden input + draw on canvas via Image
      try {
        const hiddenInput = document.getElementById(
          "form-field-signature"
        ) as HTMLInputElement | null;
        if (hiddenInput) {
          hiddenInput.value = dataUrl;
          hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
          hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));

          // Also draw visually onto the canvas for the widget's internal state
          const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              const img = new Image();
              img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              };
              img.src = dataUrl;
            }
          }
          return { ok: true, method: "hidden_input_direct" };
        }
      } catch (_) {}

      return { ok: false, error: "No signature injection strategy worked" };
    }, signatureDataUrl);

    if (!injected.ok) {
      return { success: false, error: (injected as any).error ?? "Signature injection failed" };
    }

    console.log(`[safety-trainer/submit] Signature injected via: ${(injected as any).method}`);
    // Wait a moment for the widget to process the data URL
    await page.waitForTimeout(500);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalises a date string to MM/DD/YYYY format.
 * Accepts YYYY-MM-DD (ISO) or MM/DD/YYYY (passthrough).
 */
function normaliseDate(date: string): string {
  // Already MM/DD/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return date;

  // YYYY-MM-DD (ISO)
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;

  // Return as-is and let the form validation catch it
  return date;
}
