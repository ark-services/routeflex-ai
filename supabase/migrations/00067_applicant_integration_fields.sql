-- =============================================================================
-- Migration 00067: Applicant integration fields
-- =============================================================================
--
-- Creates applicant_integration_fields for per-applicant, per-provider storage.
-- For FADV: fields.package, fields.location, fields.facility_id, fields.position_type.
-- UNIQUE(applicant_id, provider) — one row per applicant per integration.
-- =============================================================================


-- ── PART 1: applicant_integration_fields table ────────────────────────────────

CREATE TABLE public.applicant_integration_fields (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id  uuid        NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  company_id    uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id        uuid        REFERENCES public.jobs(id) ON DELETE SET NULL,
  provider      text        NOT NULL, -- e.g. 'fadv'
  fields        jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT applicant_integration_fields_unique UNIQUE (applicant_id, provider)
);

-- Index for common lookups
CREATE INDEX applicant_integration_fields_applicant_idx
  ON public.applicant_integration_fields(applicant_id);

CREATE INDEX applicant_integration_fields_company_idx
  ON public.applicant_integration_fields(company_id);

CREATE INDEX applicant_integration_fields_provider_idx
  ON public.applicant_integration_fields(provider);


-- ── PART 2: Row Level Security ────────────────────────────────────────────────

ALTER TABLE public.applicant_integration_fields ENABLE ROW LEVEL SECURITY;

-- Company members can read integration fields for their company's applicants
CREATE POLICY "Company members can read integration fields"
  ON public.applicant_integration_fields
  FOR SELECT
  USING (public.is_company_member(company_id));

-- Company members can insert/update integration fields
CREATE POLICY "Company members can write integration fields"
  ON public.applicant_integration_fields
  FOR INSERT
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY "Company members can update integration fields"
  ON public.applicant_integration_fields
  FOR UPDATE
  USING (public.is_company_member(company_id));

CREATE POLICY "Company members can delete integration fields"
  ON public.applicant_integration_fields
  FOR DELETE
  USING (public.is_company_member(company_id));


-- ── PART 3: Comments ─────────────────────────────────────────────────────────

COMMENT ON TABLE public.applicant_integration_fields IS
  'Per-applicant, per-integration field storage. One row per (applicant, provider). '
  'For FADV: fields = { package, location, facility_id, position_type }.';

COMMENT ON COLUMN public.applicant_integration_fields.provider IS
  'Integration provider key, e.g. "fadv". Determines schema of fields jsonb.';

COMMENT ON COLUMN public.applicant_integration_fields.fields IS
  'Provider-specific fields as JSON. '
  'FADV keys: package, location, facility_id, position_type.';


-- ── SUCCESS ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '✅ Created applicant_integration_fields with RLS';
  RAISE NOTICE '   UNIQUE(applicant_id, provider)';
  RAISE NOTICE '   Ready for FADV fields: package, location, facility_id, position_type';
END $$;
