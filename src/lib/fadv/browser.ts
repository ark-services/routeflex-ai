/**
 * FADV browser launcher.
 *
 * Launches an ephemeral Chromium context (no persistent profile directory) to
 * avoid all Chrome singleton-lock and SQLite database-lock issues that arise
 * from persistent profiles being shared across processes or browser binaries.
 *
 * Session persistence is achieved by saving and restoring FADV cookies to a
 * small JSON file keyed by clientId. On the first run after a successful
 * login the cookies are written to .fadv-cookies/<clientId>.json; every
 * subsequent run injects them before navigating so FADV skips the security
 * question — identical behaviour to a persistent profile but without the
 * file-lock fragility.
 *
 * Usage:
 *   const dbCookies = await loadDbCookies(companyId);  // optional cold-start fallback
 *   const context = await launchFadvContext(clientId, dbCookies ?? undefined);
 *   try {
 *     const page = await context.newPage();
 *     // ... automation
 *     const cookies = await saveFadvCookies(context, clientId); // call after successful login
 *     await saveDbCookies(companyId, cookies);                  // persist to DB too
 *   } finally {
 *     await context.close(); // closes both context AND the underlying browser
 *   }
 */

import { chromium as playwrightChromium, BrowserContext, Cookie } from "playwright-core";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";

const isServerless = !!(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.AWS_EXECUTION_ENV
);

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

function cookiesPathForClient(clientId: string): string {
  const safe = clientId.replace(/[^a-zA-Z0-9_-]/g, "_") || "default";
  const base = isServerless
    ? "/tmp/fadv-cookies"
    : join(process.cwd(), ".fadv-cookies");
  return join(base, `${safe}.json`);
}

/**
 * Launch a fresh Chromium context and inject any previously saved FADV cookies
 * so FADV recognises the session and skips the security question.
 *
 * context.close() is patched to also close the underlying Browser so callers
 * don't need to track a separate browser reference.
 */
/**
 * @param clientId   FADV Client ID — used as the filesystem cookie file key.
 * @param seedCookies Optional cookies loaded from the database (cold-start fallback).
 *                    Injected only when no filesystem cookie file exists.
 */
export async function launchFadvContext(clientId = "default", seedCookies?: Cookie[]): Promise<BrowserContext> {
  let context: BrowserContext;

  if (isServerless) {
    const sparticuz = (await import("@sparticuz/chromium")).default;
    console.log("[launchFadvContext] Serverless Chromium");
    const browser = await playwrightChromium.launch({
      args: sparticuz.args,
      executablePath: await sparticuz.executablePath(),
      headless: true,
    });
    context = await browser.newContext({ userAgent: USER_AGENT });
    patchClose(context, browser);
  } else {
    console.log("[launchFadvContext] Playwright Chromium (ephemeral)");
    const browser = await playwrightChromium.launch({
      headless: process.env.FADV_HEADED !== "true",
      // Remove --enable-automation (Playwright's default) — FADV's backend
      // detects it and silently rejects the login POST.
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        "--disable-blink-features=AutomationControlled",
        // Suppress the "Restore pages?" crash-recovery bubble
        "--disable-session-crashed-bubble",
        "--disable-features=InfiniteSessionRestore",
      ],
    });
    context = await browser.newContext({ userAgent: USER_AGENT });
    patchClose(context, browser);
  }

  // Inject previously saved FADV session cookies so the security question is
  // skipped on all runs after the first successful login.
  //
  // Precedence:
  //   1. Filesystem cookies — primary store (local dev + warm serverless instances)
  //   2. DB cookies (seedCookies) — cold-start fallback when no filesystem file exists
  const cookiesPath = cookiesPathForClient(clientId);
  if (existsSync(cookiesPath)) {
    try {
      const saved = JSON.parse(readFileSync(cookiesPath, "utf-8"));
      await context.addCookies(saved);
      console.log(`[launchFadvContext] Injected ${saved.length} saved FADV cookies (filesystem)`);
    } catch {
      console.warn("[launchFadvContext] Failed to load saved cookies — starting fresh");
    }
  } else if (seedCookies?.length) {
    try {
      await context.addCookies(seedCookies);
      console.log(`[launchFadvContext] Injected ${seedCookies.length} FADV cookies (DB cold-start fallback)`);
    } catch {
      console.warn("[launchFadvContext] Failed to inject DB seed cookies — starting fresh");
    }
  }

  return context;
}

/**
 * Save the FADV session cookies from the current context to disk so the next
 * run can skip the security question. Call this after a successful login.
 *
 * Returns the saved cookie array so callers can also persist it to the database
 * via saveDbCookies (for serverless cold-start resilience). Returns an empty
 * array on error (non-fatal).
 */
export async function saveFadvCookies(
  context: BrowserContext,
  clientId: string
): Promise<Cookie[]> {
  try {
    const cookies = await context.cookies("https://enterprise.fadv.com");
    const cookiesPath = cookiesPathForClient(clientId);
    mkdirSync(dirname(cookiesPath), { recursive: true });
    writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
    console.log(`[saveFadvCookies] Saved ${cookies.length} FADV cookies for client ${clientId}`);
    return cookies;
  } catch (err) {
    // Non-fatal — next run will just need the security question again
    console.warn("[saveFadvCookies] Failed to save cookies:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Patch context.close() so it also shuts down the underlying browser. */
function patchClose(context: BrowserContext, browser: import("playwright-core").Browser) {
  const origClose = context.close.bind(context);
  context.close = async (...args: Parameters<typeof origClose>) => {
    await origClose(...args).catch(() => {});
    await browser.close().catch(() => {});
  };
}

// ---------------------------------------------------------------------------
// Back-compat shim
// ---------------------------------------------------------------------------
/** @deprecated Use launchFadvContext instead. */
export async function launchFadvBrowser(): Promise<never> {
  throw new Error(
    "launchFadvBrowser is deprecated — use launchFadvContext(clientId) instead"
  );
}
