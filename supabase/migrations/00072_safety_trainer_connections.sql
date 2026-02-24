-- Migration: 00072_safety_trainer_connections
--
-- Adds the safety_trainer_connections table for storing company-level
-- Safety Trainer Hub integration config (trainer identity, company IDs,
-- and a base64 PNG signature for form injection).
--
-- Mirrors the fadv_connections table pattern: one row per company,
-- encrypted/sensitive fields never returned to the client (signature_data_url
-- is stripped by the server action and only passed to the Playwright runner).

CREATE TABLE IF NOT EXISTS safety_trainer_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid UNIQUE NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Trainer identity (stored once, same for every submission)
  trainer_name       text NOT NULL DEFAULT '',
  trainer_email      text NOT NULL DEFAULT '',
  trainer_fedex_id   text NOT NULL DEFAULT '',

  -- Company/contract identifiers
  company_entity_id  text NOT NULL DEFAULT '',
  contract_number    text NOT NULL DEFAULT '',
  company_name       text NOT NULL DEFAULT '',

  -- Base64 PNG of the trainer's signature.
  -- NEVER returned to the client UI — only used server-side during Playwright runs.
  signature_data_url text,

  is_enabled         boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_safety_trainer_connections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_safety_trainer_connections_updated_at
BEFORE UPDATE ON safety_trainer_connections
FOR EACH ROW EXECUTE FUNCTION update_safety_trainer_connections_updated_at();

-- RLS: enable but allow authenticated company members to SELECT the config
-- (signature_data_url is stripped server-side before reaching the client)
ALTER TABLE safety_trainer_connections ENABLE ROW LEVEL SECURITY;

-- Members of the company can read the config row
-- (uses the same is_company_member helper as fadv_connections)
CREATE POLICY "Company members can view safety trainer config"
  ON safety_trainer_connections
  FOR SELECT
  USING (public.is_company_member(company_id));

-- Writes go through service-role server actions only (no direct client writes)
