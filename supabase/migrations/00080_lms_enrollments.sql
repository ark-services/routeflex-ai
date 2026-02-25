-- Migration: 00080_lms_enrollments
--
-- Adds learner enrollment tracking and per-module quiz attempt history.
--
-- Flow:
--   1. Automation action `lms.send_training_link` creates an lms_enrollments row
--      and emails the applicant their unique magic link (/learn/[token]).
--   2. Learner reads each module and submits quizzes via the public learner portal.
--   3. Each quiz submission inserts an lms_module_attempts row with the answers + score.
--   4. When all non-final modules are passed AND the final exam is passed,
--      the enrollment status flips to 'completed' and the `lms.course_completed`
--      automation trigger fires (updating the applicant's board stage).
--
-- Access pattern:
--   - Company members access via RLS (board progress panel, learner report).
--   - Learners are unauthenticated — server-side API routes use the service role
--     key and look up enrollments by token. No public RLS policy is needed.

-- ── lms_enrollments ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lms_enrollments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id  uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  course_id     uuid NOT NULL REFERENCES public.lms_courses(id) ON DELETE RESTRICT,

  -- Unique UUID used as the learner's magic link token.
  -- URL: /learn/[token]  (never expires)
  token         uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  -- Lifecycle: enrolled → in_progress → completed
  status        text NOT NULL DEFAULT 'enrolled'
                CHECK (status IN ('enrolled', 'in_progress', 'completed')),

  enrolled_at   timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,

  -- One enrollment per applicant per course
  CONSTRAINT lms_enrollments_applicant_course_unique UNIQUE (applicant_id, course_id)
);

CREATE INDEX IF NOT EXISTS lms_enrollments_applicant_idx
  ON public.lms_enrollments(applicant_id);

CREATE INDEX IF NOT EXISTS lms_enrollments_course_idx
  ON public.lms_enrollments(course_id);

-- Fast token lookup (used by every learner portal server component)
CREATE INDEX IF NOT EXISTS lms_enrollments_token_idx
  ON public.lms_enrollments(token);

-- ── lms_module_attempts ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lms_module_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   uuid NOT NULL REFERENCES public.lms_enrollments(id) ON DELETE CASCADE,
  module_id       uuid NOT NULL REFERENCES public.lms_modules(id) ON DELETE CASCADE,

  -- Monotonically increasing per (enrollment_id, module_id)
  attempt_number  integer NOT NULL DEFAULT 1,

  -- Map of question_id → chosen option id: {"<uuid>": "b", ...}
  answers         jsonb NOT NULL,

  -- 0–100 integer score
  score           integer NOT NULL CHECK (score >= 0 AND score <= 100),

  -- true when score >= course.passing_threshold
  passed          boolean NOT NULL,

  completed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lms_module_attempts_enrollment_idx
  ON public.lms_module_attempts(enrollment_id);

CREATE INDEX IF NOT EXISTS lms_module_attempts_module_idx
  ON public.lms_module_attempts(enrollment_id, module_id);

-- Partial index for "has the learner passed this module?" queries
CREATE INDEX IF NOT EXISTS lms_module_attempts_passed_idx
  ON public.lms_module_attempts(enrollment_id, module_id)
  WHERE passed = true;

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- Company members can read enrollments for their company's applicants.
-- Unauthenticated learners access data via service-role server actions (no RLS needed).

ALTER TABLE public.lms_enrollments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_module_attempts   ENABLE ROW LEVEL SECURITY;

-- Enrollments: company members read via applicant → job → company chain
CREATE POLICY "Company members can select enrollments"
  ON public.lms_enrollments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.applicants a
      JOIN public.lms_courses c ON c.id = course_id
      WHERE a.id = applicant_id AND public.is_company_member(c.company_id)
    )
  );

-- Automation action executor (runs as authenticated user session) inserts enrollments
CREATE POLICY "Company members can insert enrollments"
  ON public.lms_enrollments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lms_courses c
      WHERE c.id = course_id AND public.is_company_member(c.company_id)
    )
  );

-- Status updates happen via service role (no user-session update policy needed)

-- Module attempts: company members read (for progress panel + learner report)
CREATE POLICY "Company members can select module attempts"
  ON public.lms_module_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lms_enrollments e
      JOIN public.lms_courses c ON c.id = e.course_id
      WHERE e.id = enrollment_id AND public.is_company_member(c.company_id)
    )
  );

-- Inserts happen via service role from the quiz submission API (unauthenticated learner)

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.lms_enrollments IS
  'One row per applicant per course. Created by the lms.send_training_link automation action. '
  'token is the magic link UUID embedded in /learn/[token] — never expires. '
  'status: enrolled → in_progress (first quiz started) → completed (final exam passed).';

COMMENT ON COLUMN public.lms_enrollments.token IS
  'UUID used as the learner magic link: /learn/[token]. Never expires. '
  'Learner portal server components look this up via service-role Supabase client.';

COMMENT ON TABLE public.lms_module_attempts IS
  'Records every quiz submission. Multiple rows per (enrollment_id, module_id) '
  'for retries (attempt_number increments). '
  'To check if a module is passed: SELECT EXISTS(...WHERE passed=true).';

COMMENT ON COLUMN public.lms_module_attempts.answers IS
  'Map of question_id → chosen option id. '
  'Example: {"3fa85f64-...": "b", "6ba7b810-...": "d"}';

DO $$
BEGIN
  RAISE NOTICE '✅ Created lms_enrollments, lms_module_attempts';
  RAISE NOTICE '   token index for fast /learn/[token] lookups';
  RAISE NOTICE '   passed index for efficient module unlock checks';
END $$;
