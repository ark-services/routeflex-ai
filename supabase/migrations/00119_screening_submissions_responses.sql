-- Migration: 00119_screening_submissions_responses
--
-- Adds screening submissions (one per applicant send, lifecycle tracked)
-- and screening responses (one answer per question per submission).

-- ── 1. screening_submissions ──────────────────────────────────────────────────

CREATE TYPE public.screening_submission_status AS ENUM (
  'sent',
  'started',
  'completed',
  'expired',
  'auto_rejected'
);

CREATE TABLE public.screening_submissions (
  id                uuid                              PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id      uuid                              NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  job_id            uuid                              NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  config_id         uuid                              NOT NULL REFERENCES public.screening_configs(id) ON DELETE CASCADE,
  token             uuid                              NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status            public.screening_submission_status NOT NULL DEFAULT 'sent',
  ai_score          integer                           CHECK (ai_score BETWEEN 0 AND 100),
  ai_summary        text,
  recommendation    text                              CHECK (recommendation IN ('ready_for_fadv','needs_review','not_recommended')),
  distance_miles    numeric,
  drive_time_minutes integer,
  created_at        timestamptz                       NOT NULL DEFAULT now(),
  expires_at        timestamptz,
  completed_at      timestamptz
);

CREATE INDEX screening_submissions_token_idx       ON public.screening_submissions(token);
CREATE INDEX screening_submissions_applicant_id_idx ON public.screening_submissions(applicant_id);
CREATE INDEX screening_submissions_job_id_idx      ON public.screening_submissions(job_id);

ALTER TABLE public.screening_submissions ENABLE ROW LEVEL SECURITY;

-- Company members can read submissions for their jobs
CREATE POLICY "Company members can view screening submissions"
  ON public.screening_submissions FOR SELECT
  USING (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE public.is_company_member(company_id)
    )
  );

-- ── 2. screening_responses ────────────────────────────────────────────────────

CREATE TABLE public.screening_responses (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id         uuid    NOT NULL REFERENCES public.screening_submissions(id) ON DELETE CASCADE,
  question_id           uuid    NOT NULL REFERENCES public.screening_questions(id) ON DELETE CASCADE,
  value_text            text,
  value_number          numeric,
  value_boolean         boolean,
  ai_question_score     integer CHECK (ai_question_score BETWEEN 0 AND 100),
  is_dealbreaker_failure boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX screening_responses_submission_id_idx ON public.screening_responses(submission_id);

ALTER TABLE public.screening_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view screening responses"
  ON public.screening_responses FOR SELECT
  USING (
    submission_id IN (
      SELECT ss.id FROM public.screening_submissions ss
      JOIN public.jobs j ON j.id = ss.job_id
      WHERE public.is_company_member(j.company_id)
    )
  );

DO $$
BEGIN
  RAISE NOTICE '✅ Created screening_submissions and screening_responses tables';
END $$;
