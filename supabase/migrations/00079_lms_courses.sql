-- Migration: 00079_lms_courses
--
-- Adds per-company LMS courses, modules, and questions.
-- Companies create courses by cloning a template (template_id is set)
-- or from scratch (template_id is null).
--
-- Table hierarchy:
--   lms_courses       (one per company per curriculum)
--     └── lms_modules (ordered content + quiz sections; last one is the final exam)
--           └── lms_questions (multiple-choice quiz questions)

-- ── lms_courses ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lms_courses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Null if the course was created from scratch
  template_id        uuid REFERENCES public.lms_course_templates(id) ON DELETE SET NULL,
  name               text NOT NULL,
  description        text,
  -- Minimum score (0–100) required to pass each module quiz and the final exam.
  -- Stored on the course so it can be customised per company.
  passing_threshold  integer NOT NULL DEFAULT 80,
  -- When false the course is invisible to learners (prevents premature enrollment)
  is_published       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lms_courses_company_idx
  ON public.lms_courses(company_id);

CREATE OR REPLACE FUNCTION _lms_courses_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_lms_courses_updated_at
BEFORE UPDATE ON lms_courses
FOR EACH ROW EXECUTE FUNCTION _lms_courses_set_updated_at();

-- ── lms_modules ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lms_modules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL REFERENCES public.lms_courses(id) ON DELETE CASCADE,
  sort_order    integer NOT NULL DEFAULT 0,
  title         text NOT NULL,
  -- Markdown content; empty string for final-exam modules
  content       text NOT NULL DEFAULT '',
  -- Exactly one module per course should have is_final_exam=true.
  -- It must be last in sort_order and is unlocked only after all other modules pass.
  is_final_exam boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lms_modules_course_idx
  ON public.lms_modules(course_id, sort_order);

CREATE OR REPLACE FUNCTION _lms_modules_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_lms_modules_updated_at
BEFORE UPDATE ON lms_modules
FOR EACH ROW EXECUTE FUNCTION _lms_modules_set_updated_at();

-- ── lms_questions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lms_questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id         uuid NOT NULL REFERENCES public.lms_modules(id) ON DELETE CASCADE,
  sort_order        integer NOT NULL DEFAULT 0,
  question_text     text NOT NULL,
  -- Array of 4 answer choices: [{id: "a", text: "..."}, {id: "b", text: "..."}, ...]
  options           jsonb NOT NULL,
  -- The id of the correct option ("a", "b", "c", or "d")
  correct_option_id text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lms_questions_module_idx
  ON public.lms_questions(module_id, sort_order);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.lms_courses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_modules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_questions  ENABLE ROW LEVEL SECURITY;

-- Company members can fully manage their company's courses
CREATE POLICY "Company members can select courses"
  ON public.lms_courses FOR SELECT
  USING (public.is_company_member(company_id));

CREATE POLICY "Company members can insert courses"
  ON public.lms_courses FOR INSERT
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY "Company members can update courses"
  ON public.lms_courses FOR UPDATE
  USING (public.is_company_member(company_id));

CREATE POLICY "Company members can delete courses"
  ON public.lms_courses FOR DELETE
  USING (public.is_company_member(company_id));

-- Modules: scoped through course ownership
CREATE POLICY "Company members can select modules"
  ON public.lms_modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lms_courses c
      WHERE c.id = course_id AND public.is_company_member(c.company_id)
    )
  );

CREATE POLICY "Company members can insert modules"
  ON public.lms_modules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lms_courses c
      WHERE c.id = course_id AND public.is_company_member(c.company_id)
    )
  );

CREATE POLICY "Company members can update modules"
  ON public.lms_modules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.lms_courses c
      WHERE c.id = course_id AND public.is_company_member(c.company_id)
    )
  );

CREATE POLICY "Company members can delete modules"
  ON public.lms_modules FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.lms_courses c
      WHERE c.id = course_id AND public.is_company_member(c.company_id)
    )
  );

-- Questions: scoped through module → course ownership
CREATE POLICY "Company members can select questions"
  ON public.lms_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lms_modules m
      JOIN public.lms_courses c ON c.id = m.course_id
      WHERE m.id = module_id AND public.is_company_member(c.company_id)
    )
  );

CREATE POLICY "Company members can insert questions"
  ON public.lms_questions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lms_modules m
      JOIN public.lms_courses c ON c.id = m.course_id
      WHERE m.id = module_id AND public.is_company_member(c.company_id)
    )
  );

CREATE POLICY "Company members can update questions"
  ON public.lms_questions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.lms_modules m
      JOIN public.lms_courses c ON c.id = m.course_id
      WHERE m.id = module_id AND public.is_company_member(c.company_id)
    )
  );

CREATE POLICY "Company members can delete questions"
  ON public.lms_questions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.lms_modules m
      JOIN public.lms_courses c ON c.id = m.course_id
      WHERE m.id = module_id AND public.is_company_member(c.company_id)
    )
  );

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.lms_courses IS
  'Per-company LMS courses. Created by cloning a template (template_id set) '
  'or from scratch (template_id null). is_published must be true before '
  'enrollments can be created.';

COMMENT ON COLUMN public.lms_courses.passing_threshold IS
  'Minimum score (0–100) to pass a module quiz or the final exam. Default: 80.';

COMMENT ON TABLE public.lms_modules IS
  'Ordered sections of an LMS course. Each module has content (markdown) '
  'and a quiz. The is_final_exam=true module is unlocked only after all '
  'other modules are passed.';

COMMENT ON TABLE public.lms_questions IS
  'Multiple-choice questions for a module quiz or final exam. '
  'options JSON: [{id: "a", text: "..."}, ...] — always 4 options.';

DO $$
BEGIN
  RAISE NOTICE '✅ Created lms_courses, lms_modules, lms_questions';
END $$;
