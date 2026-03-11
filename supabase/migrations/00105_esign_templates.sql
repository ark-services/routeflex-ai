-- Migration 00105: eSign templates
--
-- Maps Adobe Sign library documents to field mappings and signer configurations.
-- Templates are configured on the integrations page and referenced by ID in automations.

CREATE TABLE IF NOT EXISTS public.esign_templates (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Adobe Sign library document reference
  library_document_id   text        NOT NULL,
  library_document_name text        NOT NULL,
  -- Human-friendly name for the template within RouteFlex
  display_name          text        NOT NULL,
  -- Field mapping: JSON array of { adobeFieldName, source, boardColumnId?, staticValue? }
  field_mappings        jsonb       NOT NULL DEFAULT '[]',
  -- Signers: JSON array of { order, role, label, emailSource, emailColumnId?, staticEmail? }
  signers               jsonb       NOT NULL DEFAULT '[]',
  -- Lifecycle
  is_enabled            boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- Prevent duplicate templates for the same library doc in one company
  UNIQUE(company_id, library_document_id)
);

CREATE INDEX IF NOT EXISTS esign_templates_company_id_idx
  ON public.esign_templates(company_id);

ALTER TABLE public.esign_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view esign templates"
  ON public.esign_templates
  FOR SELECT
  USING (public.is_company_member(company_id));

-- Writes via service role (bypass RLS)
