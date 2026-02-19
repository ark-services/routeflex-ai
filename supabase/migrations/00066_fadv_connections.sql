-- =============================================================================
-- Migration 00066: First Advantage (FADV) connections (company-level)
-- =============================================================================
--
-- Creates fadv_connections table for company-scoped FADV integration config.
-- Stores: CSP ID, Company ID, optional username + encrypted password, enabled flag.
-- Sensitive password is AES-256-GCM encrypted at rest.
-- All writes go through server actions using the service-role key.
-- =============================================================================


-- ── PART 1: fadv_connections table ───────────────────────────────────────────

CREATE TABLE public.fadv_connections (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid        NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  csp_id                  text        NOT NULL DEFAULT '',
  company_id_value        text        NOT NULL DEFAULT '',
  username                text,
  encrypted_password      text,
  is_enabled              boolean     NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Index on company_id (UNIQUE already creates one; explicit for clarity)
CREATE INDEX fadv_connections_company_id_idx
  ON public.fadv_connections(company_id);


-- ── PART 2: Row Level Security ────────────────────────────────────────────────

ALTER TABLE public.fadv_connections ENABLE ROW LEVEL SECURITY;

-- Company members may read their company's FADV config.
-- csp_id and company_id_value are safe to display (not secrets).
-- encrypted_password is NEVER sent to the client; the application strips it.
CREATE POLICY "Company members can view FADV connection"
  ON public.fadv_connections
  FOR SELECT
  USING (public.is_company_member(company_id));

-- No INSERT / UPDATE / DELETE policies.
-- All writes go through server actions that use the service-role key.


-- ── PART 3: Comments ─────────────────────────────────────────────────────────

COMMENT ON TABLE public.fadv_connections IS
  'Company-level First Advantage (FADV) integration config. One row per company.';

COMMENT ON COLUMN public.fadv_connections.csp_id IS
  'FADV CSP ID (required for submission). Safe to display.';

COMMENT ON COLUMN public.fadv_connections.company_id_value IS
  'FADV Company ID (required for submission). Safe to display.';

COMMENT ON COLUMN public.fadv_connections.encrypted_password IS
  'AES-256-GCM encrypted FADV password. MUST NEVER be returned to the client.';


-- ── SUCCESS ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '✅ Created fadv_connections table with RLS';
  RAISE NOTICE '   Fields: csp_id, company_id_value, username, encrypted_password, is_enabled';
END $$;
