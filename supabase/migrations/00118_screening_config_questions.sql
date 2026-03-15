-- Migration: 00118_screening_config_questions
--
-- Adds screening configuration and question tables.
-- Each job has at most one screening config. Questions are ordered
-- and support multiple types, dealbreaker conditions, and AI scoring guidance.

-- ── 1. Add terminal_address to jobs ──────────────────────────────────────────

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS terminal_address text NOT NULL DEFAULT '';

-- ── 2. screening_configs ──────────────────────────────────────────────────────

CREATE TABLE public.screening_configs (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                  uuid        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id              uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  deadline_hours          integer     NOT NULL DEFAULT 48,
  auto_reject_dealbreakers boolean    NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id)
);

CREATE INDEX screening_configs_company_id_idx ON public.screening_configs(company_id);

ALTER TABLE public.screening_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage screening configs"
  ON public.screening_configs
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

-- ── 3. screening_questions ────────────────────────────────────────────────────

CREATE TABLE public.screening_questions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id             uuid        NOT NULL REFERENCES public.screening_configs(id) ON DELETE CASCADE,
  sort_order            integer     NOT NULL DEFAULT 0,
  text                  text        NOT NULL,
  type                  text        NOT NULL CHECK (type IN ('multiple_choice','short_text','yes_no','number')),
  options               jsonb,      -- for multiple_choice: [{"id": "a", "label": "..."}]
  is_dealbreaker        boolean     NOT NULL DEFAULT false,
  dealbreaker_condition jsonb,      -- e.g. {"answer": "no"} or {"operator": "lt", "value": 21}
  ai_scoring_guidance   text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX screening_questions_config_id_idx ON public.screening_questions(config_id);

ALTER TABLE public.screening_questions ENABLE ROW LEVEL SECURITY;

-- Access via config → company membership check
CREATE POLICY "Company members can manage screening questions"
  ON public.screening_questions
  USING (
    config_id IN (
      SELECT id FROM public.screening_configs
      WHERE public.is_company_member(company_id)
    )
  )
  WITH CHECK (
    config_id IN (
      SELECT id FROM public.screening_configs
      WHERE public.is_company_member(company_id)
    )
  );

DO $$
BEGIN
  RAISE NOTICE '✅ Created screening_configs and screening_questions tables';
  RAISE NOTICE '✅ Added terminal_address to jobs';
END $$;
