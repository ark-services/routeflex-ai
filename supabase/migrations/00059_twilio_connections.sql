-- =============================================================================
-- Migration 00059: Twilio connections (company-level)
-- =============================================================================
--
-- 1. Relaxes activity_events.job_id to nullable so company-level events
--    (integrations, billing, etc.) can be logged without a specific job.
-- 2. Creates public.twilio_connections — one row per company, storing
--    encrypted Auth Token. Client may SELECT; writes are server-only.
-- =============================================================================


-- ── PART 1: make activity_events.job_id nullable ─────────────────────────────
-- The FK constraint remains; NULL simply means "no specific job".

ALTER TABLE public.activity_events
  ALTER COLUMN job_id DROP NOT NULL;


-- ── PART 2: twilio_connections table ─────────────────────────────────────────

CREATE TABLE public.twilio_connections (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  account_sid          text        NOT NULL,
  auth_token_encrypted text        NOT NULL,
  from_number          text        NOT NULL,
  is_enabled           boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Explicit index on company_id (UNIQUE already creates one, this is belt+suspenders)
CREATE INDEX twilio_connections_company_id_idx
  ON public.twilio_connections(company_id);


-- ── PART 3: Row Level Security ────────────────────────────────────────────────

ALTER TABLE public.twilio_connections ENABLE ROW LEVEL SECURITY;

-- Company members may read their company's Twilio config
-- (masked by the application; auth_token_encrypted is never sent to client)
CREATE POLICY "Company members can view Twilio connection"
  ON public.twilio_connections
  FOR SELECT
  USING (public.is_company_member(company_id));

-- No INSERT / UPDATE / DELETE policies.
-- All writes go through server actions that use the service-role key,
-- bypassing RLS entirely.  The application enforces admin-only access.


-- ── PART 4: Comments ─────────────────────────────────────────────────────────

COMMENT ON TABLE public.twilio_connections IS
  'Company-level Twilio API credentials. One connection per company.';

COMMENT ON COLUMN public.twilio_connections.auth_token_encrypted IS
  'AES-256-GCM encrypted Twilio Auth Token. The plaintext value MUST NEVER be returned to the client.';

COMMENT ON COLUMN public.twilio_connections.account_sid IS
  'Twilio Account SID (starts with AC). Safe to display masked on the client.';
