-- Migration 00108: Store Adobe Sign OAuth app credentials per company
--
-- Allows each company to enter their own Adobe Sign Client ID + Secret
-- directly in the UI, removing the need for server env vars.
-- Also makes token/access fields nullable to support a "credentials saved
-- but not yet authorized" state before the OAuth handshake completes.

ALTER TABLE public.adobe_sign_connections
  ADD COLUMN IF NOT EXISTS client_id_encrypted      text,
  ADD COLUMN IF NOT EXISTS client_secret_encrypted  text;

-- Make these nullable so we can store credentials before the OAuth flow runs
ALTER TABLE public.adobe_sign_connections
  ALTER COLUMN access_token_encrypted  DROP NOT NULL,
  ALTER COLUMN api_access_point        DROP NOT NULL,
  ALTER COLUMN email_address           DROP NOT NULL;
