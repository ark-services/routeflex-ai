-- Add encrypted_session_cookies column to fadv_connections.
--
-- FADV session cookies are now persisted to the database (encrypted with
-- AES-256-GCM) in addition to the local filesystem. This allows serverless
-- deployments (Vercel, AWS Lambda) to survive cold starts without losing
-- the FADV browser session, which would otherwise force the security-question
-- step on every cold start and risk headless-mode bot detection failures.
--
-- The column is nullable. A NULL value means no cookies have been saved yet
-- (first run), and the login flow will proceed through the security question
-- as normal before saving fresh cookies back here.

ALTER TABLE fadv_connections
  ADD COLUMN IF NOT EXISTS encrypted_session_cookies text;
