-- Migration: 00074_safety_trainer_login
--
-- Adds encrypted_trainer_password to safety_trainer_connections so the
-- Playwright runner can log into safetytrainer.kellyandersongroup.com
-- before filling the certification form.
--
-- The trainer's FedEx ID (trainer_fedex_id) is used as the WordPress username.
-- The password is stored AES-256-GCM encrypted via the app's encrypt() helper,
-- identical to how FADV credentials are stored.

ALTER TABLE safety_trainer_connections
  ADD COLUMN IF NOT EXISTS encrypted_trainer_password text;

COMMENT ON COLUMN safety_trainer_connections.encrypted_trainer_password IS
  'AES-256-GCM encrypted Safety Trainer Hub login password. MUST NEVER be returned to the client.';
