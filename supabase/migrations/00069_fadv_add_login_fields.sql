-- =============================================================================
-- Migration 00069: First Advantage — add client_id and encrypted_security_answer
-- =============================================================================
--
-- Adds two new columns to fadv_connections to support the FADV two-step login:
--
--   Step 1 (login page) : Client ID + User ID (username) + Password
--   Step 2 (next page)  : Security Answer
--
-- Sensitivity:
--   • client_id                  — NOT a secret; stored as plain text
--   • encrypted_security_answer  — SECRET; stored AES-256-GCM encrypted
--
-- When is_enabled = true all six config fields are required:
--   csp_id, company_id_value, client_id, username,
--   encrypted_password, encrypted_security_answer
-- (enforced in the server action; optional DB constraint left for reference below)
-- =============================================================================


-- ── Add columns ───────────────────────────────────────────────────────────────

ALTER TABLE public.fadv_connections
  ADD COLUMN IF NOT EXISTS client_id                 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS encrypted_security_answer text;


-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.fadv_connections.client_id IS
  'FADV Client ID (plaintext). Entered on the FADV login page. Not a secret.';

COMMENT ON COLUMN public.fadv_connections.encrypted_security_answer IS
  'AES-256-GCM encrypted FADV security answer. MUST NEVER be returned to the client.';


-- ── SUCCESS ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '✅ Added client_id and encrypted_security_answer to fadv_connections';
  RAISE NOTICE '   client_id: plaintext — safe to display';
  RAISE NOTICE '   encrypted_security_answer: AES-256-GCM — never expose to client';
END $$;
