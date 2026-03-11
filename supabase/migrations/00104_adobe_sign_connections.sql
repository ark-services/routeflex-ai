-- Migration 00104: Adobe Sign (Acrobat Sign) OAuth connections
--
-- Stores encrypted OAuth tokens for the Adobe Sign API integration.
-- One active connection per company (like gmail_connections, twilio_connections).

CREATE TABLE IF NOT EXISTS public.adobe_sign_connections (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid        NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  -- OAuth tokens (encrypted with AES-256-GCM)
  access_token_encrypted  text        NOT NULL,
  refresh_token_encrypted text,
  token_expiry            timestamptz,
  -- Adobe Sign returns api_access_point with the token — the base URL for API calls
  api_access_point        text        NOT NULL,
  -- The user's Adobe Sign email (display only)
  email_address           text        NOT NULL,
  -- Webhook registered for this connection
  webhook_id              text,
  -- Lifecycle
  is_enabled              boolean     NOT NULL DEFAULT true,
  revoked_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adobe_sign_connections_company_id_idx
  ON public.adobe_sign_connections(company_id);

ALTER TABLE public.adobe_sign_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view Adobe Sign connection"
  ON public.adobe_sign_connections
  FOR SELECT
  USING (public.is_company_member(company_id));

-- No INSERT/UPDATE/DELETE policies — service role bypasses RLS.
