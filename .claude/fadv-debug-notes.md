# FADV Automation Debug Notes
_Last updated: 2026-02-22, end-of-session — ALL STEPS WORKING_

## Current status — FULLY WORKING ✅
End-to-end submission confirmed: Montelius McDaniel, 2026-02-22 2:54 PM

- ✅ Login (credentials + Angular form, stealth flags)
- ✅ Security question (Step 2) — `waitFor({ state: "visible" })` on `loginIframe`
- ✅ FCRA notice / session.do (Step 3)
- ✅ New Subject form fill + Send
- ✅ GWT confirmation dialog detection (`td.html-face` + "OK")
- ✅ Cookie save/restore (skips security question on repeat runs)
- ✅ Session Expired dialog dismissal
- ✅ Session Override (Step 1b) — "Proceed" button — **FIXED 2026-02-22**
- ✅ `disclaimerNew.jsp` FCRA notice (Step 1c) — "I Agree" click — **FIXED 2026-02-22**

---

## ~~The Session Override problem~~ — RESOLVED

### What happens
When saved cookies are injected and FADV detects an existing active session,
the Angular SPA inside `new-login-iframe` renders a "Session Override" page
with "Proceed" and "Help" buttons. The main page URL stays at `userLogin.do`.
The code must click "Proceed" before FADV will proceed to the normal post-login flow.

### What we've tried (all failed)
1. **5-second pre-check** with `loginContext.getByRole("button", { name: /^proceed$/i })` —
   timed out at 5s (server takes >5s to respond), race continued to waitForURL which also timed out
2. **`Promise.race` with `loginContext.getByRole`** — `loginContext` is a captured frame
   that becomes stale after Angular re-renders; stale frames throw immediately, `.catch()`
   resolved to "timeout" instantly (total time ~13s)
3. **`Promise.race` with `page.frameLocator('[name="new-login-iframe"]')`** — FADV sets the
   iframe `name` as a **JS property, not an HTML attribute**, so CSS attribute selector
   `[name=...]` never matches; ran full 30s timeout (total time ~39s)
4. **Current code: polling loop with `page.frame({ name: LOGIN_FRAME_NAME })`** — should work
   since `page.frame({ name })` uses Playwright's internal registry (tracks JS properties).
   BUT: **we haven't been able to test this yet** because the extension wasn't connected
   when the user tried to read the page DOM.

### Why we need to read the page DOM
We need to verify the **exact HTML structure** of the "Proceed" button in the iframe,
specifically:
- Is it a `<button>` element?
- What is its text content exactly (any hidden spans, whitespace, etc.)?
- Is it inside a shadow DOM component?
- What classes/attributes does it have?

### Next step: connect extension to Brave, read the DOM
1. User opens Brave to `enterprise.fadv.com/pub/l/login/userLogin.do` with Session Override visible
2. User connects the Claude extension in Brave
3. Run: `mcp__Claude_in_Chrome__tabs_context_mcp`
4. Get the tab ID of the FADV page
5. Run `mcp__Claude_in_Chrome__javascript_tool` with this JS to read the iframe's button HTML:
   ```javascript
   // Run in the main FADV page — finds the new-login-iframe and reads its buttons
   const iframe = document.querySelector('iframe');
   if (!iframe) return 'no iframe found';
   try {
     const doc = iframe.contentDocument || iframe.contentWindow.document;
     const buttons = doc.querySelectorAll('button');
     return Array.from(buttons).map(b => ({
       text: b.textContent?.trim(),
       outerHTML: b.outerHTML.substring(0, 300),
       visible: b.offsetParent !== null
     }));
   } catch(e) { return 'cross-origin: ' + e.message; }
   ```
6. If cross-origin blocked, try:
   ```javascript
   // Just get all iframes on the page
   return Array.from(document.querySelectorAll('iframe')).map(f => ({
     name: f.name, id: f.id, src: f.src,
     nameAttr: f.getAttribute('name')
   }));
   ```
   This will confirm whether `name` is an HTML attribute or JS-only property.

---

## Current code state

### Key files
- `src/lib/fadv/login.ts` — `doLoginSteps()` — all login steps
- `src/lib/fadv/submit.ts` — `callFadvCreateSubject()` — form fill + submit
- `src/lib/fadv/browser.ts` — `launchFadvContext()`, `saveFadvCookies()`
- `src/lib/fadv/portal-config.ts` — selectors + constants
- `src/app/api/fadv/process-queue/route.ts` — cron queue processor
- `src/app/api/fadv/retry-submission/route.ts` — POST endpoint to reset failed→queued

### Current Step 1b code (polling loop — UNTESTED)
```typescript
(async (): Promise<"session_override" | "timeout"> => {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const frame = page.frame({ name: LOGIN_FRAME_NAME });
      if (frame) {
        const visible = await frame
          .locator("button", { hasText: /proceed/i })
          .isVisible();
        if (visible) return "session_override";
      }
    } catch {
      // Frame navigating or detached — retry next tick
    }
    await new Promise<void>((r) => setTimeout(r, 300));
  }
  return "timeout";
})()
```
If this still fails, the button selector `"button", { hasText: /proceed/i }` is wrong —
need to read the actual DOM to find the correct selector.

### Key constants (portal-config.ts)
- `LOGIN_FRAME_NAME = "new-login-iframe"`
- `LOGIN_TIMEOUT_MS = 30_000`
- `NAV_TIMEOUT_MS = 30_000`
- `SUBMIT_TIMEOUT_MS = 45_000`

### Cookie files
- Saved to `.fadv-cookies/<clientId>.json`
- 13 cookies saved for client `042443LHW`
- These cookies cause the Session Override to appear on every run

### Failed submissions to retry (reset to 'queued' in Supabase)
Run this SQL for each failed submission that should be retried:
```sql
UPDATE integration_submissions
SET status='queued', error_code=NULL, error_message=NULL,
    completed_at=NULL, updated_at=NOW()
WHERE id = '<submission-uuid>';
```
Recent failed IDs (from terminal logs):
- `3317bc0a-7ad0-460a-9007-85e31f7b8d16` (Kendra Matthews — dialog detection fix)
- `23f48a99-2746-47f4-bb2f-814b740cb003` (Montelius McDaniel — session override)
- `1edad0e9-950d-4171-b8e4-65eb3b164b8b` (Montelius McDaniel — session override)
- `17dabe9e-d6dd-4034-b461-150cb81cd92c` (Montelius McDaniel — session override)

---

## Login flow diagram
```
navigate to / → navigate to userLogin.do
  → fill credentials in new-login-iframe (Angular)
  → click Login button
  → [RACE] waitForURL(away from userLogin.do) vs poll for "Proceed" button
      → if "session_override": click Proceed → waitForURL again
        → [Step 1c] if disclaimerNew.jsp: click "I Agree" → waitForURL
      → if "navigated": continue
  → [Step 2] if secretQuestion.do: fill answer → click Submit
  → [Step 3] if session.do: click "I Agree" (SEL_AGREE_BUTTON)
  → verify shell.jsp
```
