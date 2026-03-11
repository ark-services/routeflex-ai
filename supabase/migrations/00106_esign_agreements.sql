-- Migration 00106: eSign agreements tracking
--
-- Tracks sent Adobe Sign agreements for webhook callback handling.
-- When the webhook fires, we look up by adobe_agreement_id to find
-- which applicant and output columns to update.

CREATE TABLE IF NOT EXISTS public.esign_agreements (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  applicant_id          uuid        NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  job_id                uuid                 REFERENCES public.jobs(id) ON DELETE SET NULL,
  -- Adobe Sign agreement reference
  adobe_agreement_id    text        NOT NULL,
  template_id           uuid                 REFERENCES public.esign_templates(id) ON DELETE SET NULL,
  -- Configured output targets (from automation config, stored at send time)
  output_column_id      uuid                 REFERENCES public.board_columns(id) ON DELETE SET NULL,
  status_column_id      uuid                 REFERENCES public.board_columns(id) ON DELETE SET NULL,
  completed_label_id    uuid,
  file_column_id        uuid                 REFERENCES public.board_columns(id) ON DELETE SET NULL,
  -- Lifecycle
  status                text        NOT NULL DEFAULT 'sent'
                                     CHECK (status IN ('sent', 'signed', 'cancelled', 'declined', 'expired', 'error')),
  -- Metadata
  recipient_email       text,
  signed_at             timestamptz,
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS esign_agreements_company_id_idx
  ON public.esign_agreements(company_id);
CREATE INDEX IF NOT EXISTS esign_agreements_applicant_id_idx
  ON public.esign_agreements(applicant_id);
CREATE INDEX IF NOT EXISTS esign_agreements_adobe_id_idx
  ON public.esign_agreements(adobe_agreement_id);

ALTER TABLE public.esign_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view esign agreements"
  ON public.esign_agreements
  FOR SELECT
  USING (public.is_company_member(company_id));

-- Writes via service role (bypass RLS)
