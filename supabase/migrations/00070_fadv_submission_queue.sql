-- =============================================================================
-- Migration 00070: Integration submissions queue
-- =============================================================================
--
-- Creates integration_submissions for tracking background integration jobs
-- (starting with FADV / First Advantage via the fadv.add_subject action).
--
-- Flow:
--   1. Automation action `fadv.add_subject` validates input columns, then
--      inserts a row with status = 'queued'.
--   2. Vercel cron calls GET /api/fadv/process-queue every minute.
--   3. Worker atomically claims each row (queued → running), submits to FADV,
--      then writes status = 'success' | 'failed' and writes the human-readable
--      result back into output_column_id for the applicant's board row.
--
-- Idempotency:
--   The action executor checks for an existing status = 'success' record
--   before enqueueing, and skips if one already exists.
-- =============================================================================


-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.integration_submissions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  company_id         uuid        NOT NULL REFERENCES public.companies(id)          ON DELETE CASCADE,
  applicant_id       uuid        NOT NULL REFERENCES public.applicants(id)         ON DELETE CASCADE,
  job_id             uuid                 REFERENCES public.jobs(id)               ON DELETE SET NULL,
  board_id           uuid                 REFERENCES public.boards(id)             ON DELETE SET NULL,
  automation_id      uuid                 REFERENCES public.automations(id)        ON DELETE SET NULL,
  action_id          uuid                 REFERENCES public.automation_actions(id) ON DELETE SET NULL,

  -- Integration identity
  provider           text        NOT NULL DEFAULT 'fadv',

  -- Lifecycle
  status             text        NOT NULL DEFAULT 'queued'
                                 CHECK (status IN ('queued', 'running', 'success', 'failed')),

  -- Error detail (populated on failure)
  error_code         text,
  error_message      text,

  -- Success detail
  external_reference text,  -- e.g. FADV Subject ID returned on success

  -- Input data snapshot (captured at enqueue time for audit + retry)
  -- FADV keys: package, facility_id, position_type
  input_snapshot     jsonb       NOT NULL DEFAULT '{}',

  -- Output: board column where we write status messages for the applicant row
  output_column_id   uuid                 REFERENCES public.board_columns(id)      ON DELETE SET NULL,

  -- Timestamps
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz          -- set when status reaches success/failed
);


-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS integration_submissions_applicant_idx
  ON public.integration_submissions(applicant_id);

CREATE INDEX IF NOT EXISTS integration_submissions_company_idx
  ON public.integration_submissions(company_id);

CREATE INDEX IF NOT EXISTS integration_submissions_provider_idx
  ON public.integration_submissions(provider);

-- Partial index for the queue worker — covers only actionable rows
CREATE INDEX IF NOT EXISTS integration_submissions_queued_idx
  ON public.integration_submissions(created_at ASC)
  WHERE status IN ('queued', 'running');

-- Idempotency lookup: find existing success for applicant + provider
CREATE INDEX IF NOT EXISTS integration_submissions_success_idx
  ON public.integration_submissions(applicant_id, provider)
  WHERE status = 'success';


-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.integration_submissions ENABLE ROW LEVEL SECURITY;

-- Company members can read submissions for their company
CREATE POLICY "Company members can read submissions"
  ON public.integration_submissions
  FOR SELECT
  USING (public.is_company_member(company_id));

-- Automation engine (running as user session) can enqueue submissions
CREATE POLICY "Company members can insert submissions"
  ON public.integration_submissions
  FOR INSERT
  WITH CHECK (public.is_company_member(company_id));

-- Automation engine and queue worker (service role) can update status
-- Service role bypasses RLS entirely; this policy covers user-session updates
CREATE POLICY "Company members can update submissions"
  ON public.integration_submissions
  FOR UPDATE
  USING (public.is_company_member(company_id));


-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.integration_submissions IS
  'Tracks background integration submissions (FADV etc.). '
  'status lifecycle: queued → running → success | failed. '
  'Idempotency: action executor checks status=success before re-enqueueing. '
  'Queue worker (/api/fadv/process-queue) processes queued rows via Vercel cron.';

COMMENT ON COLUMN public.integration_submissions.provider IS
  'Integration provider key. Currently only "fadv".';

COMMENT ON COLUMN public.integration_submissions.input_snapshot IS
  'Field values snapshotted at enqueue time. '
  'FADV keys: package (string), facility_id (string), position_type (string).';

COMMENT ON COLUMN public.integration_submissions.external_reference IS
  'Provider-assigned reference on success. For FADV: the Subject ID returned by the API.';

COMMENT ON COLUMN public.integration_submissions.output_column_id IS
  'Board text column where human-readable status messages are written for the applicant row. '
  'Examples: "FADV submission queued...", "FADV submitted ✅ (timestamp) ref=...", '
  '"FADV failed ❌ invalid_credentials".';

COMMENT ON COLUMN public.integration_submissions.action_id IS
  'automation_actions row that triggered this submission. Nullable — may be null for manual retries.';


-- ── SUCCESS ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '✅ Created integration_submissions table';
  RAISE NOTICE '   status lifecycle: queued → running → success | failed';
  RAISE NOTICE '   input_snapshot: { package, facility_id, position_type }';
  RAISE NOTICE '   output_column_id: board column for status messages';
  RAISE NOTICE '   RLS: company members SELECT / INSERT / UPDATE';
  RAISE NOTICE '   Service role bypasses RLS for queue worker';
END $$;
