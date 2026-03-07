/**
 * Debug FADV login locally with a headed (visible) browser.
 *
 * Usage (pass credentials directly — no DB needed):
 *   npx tsx scripts/debug-fadv-login.ts <clientId> <username> <password> <securityAnswer>
 *
 * Requires:
 *   - FADV_HEADED=true and FADV_DEBUG_KEEP_BROWSER=true in .env.local (already set)
 *   - Playwright browsers installed: npx playwright install chromium
 *
 * The browser window will stay open after the test so you can inspect the page.
 */

// Load .env.local using Next.js's built-in env loader (no extra deps)
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

// Force headed + keep-open for local debugging
process.env.FADV_HEADED = "true";
process.env.FADV_DEBUG_KEEP_BROWSER = "true";

import { performFadvLogin } from "../src/lib/fadv/login";

async function main() {
  const [clientId, username, password, securityAnswer] = process.argv.slice(2);
  if (!clientId || !username || !password || !securityAnswer) {
    console.error(
      "Usage: npx tsx scripts/debug-fadv-login.ts <clientId> <username> <password> <securityAnswer>"
    );
    process.exit(1);
  }

  console.log("Credentials:", {
    clientId,
    username,
    hasPassword: !!password,
    hasSecurityAnswer: !!securityAnswer,
  });
  console.log("\n--- Starting headed FADV login ---\n");

  const result = await performFadvLogin({
    clientId,
    username,
    password,
    securityAnswer,
  });

  console.log("\n--- Result ---");
  console.log(JSON.stringify(result, null, 2));

  if (result.success) {
    console.log("\n✅ Login successful! Browser window is open — inspect the dashboard.");
  } else {
    console.log("\n❌ Login failed. Browser window is open — inspect the page state.");
  }

  // Keep process alive so the browser window stays open
  console.log("\nPress Ctrl+C to close.");
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
