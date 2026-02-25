-- Migration: 00078_lms_course_templates
--
-- Adds super-admin-managed course templates that companies can clone.
-- Templates are carrier-specific (FedEx P&D, FedEx Linehaul, Amazon DSP, etc.)
-- or custom. Only published templates are visible to companies.
--
-- Table hierarchy:
--   lms_course_templates
--     └── lms_template_modules   (ordered content sections)
--           └── lms_template_questions  (multiple-choice quiz questions)

-- ── lms_course_templates ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lms_course_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  -- Carrier type tag for filtering in the template picker UI.
  -- Values: 'fedex_pd' | 'fedex_linehaul' | 'amazon_dsp' | 'custom'
  carrier_type text,
  is_published boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION _lms_course_templates_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_lms_course_templates_updated_at
BEFORE UPDATE ON lms_course_templates
FOR EACH ROW EXECUTE FUNCTION _lms_course_templates_set_updated_at();

-- ── lms_template_modules ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lms_template_modules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES public.lms_course_templates(id) ON DELETE CASCADE,
  sort_order   integer NOT NULL DEFAULT 0,
  title        text NOT NULL,
  -- Markdown content rendered in the learner portal
  content      text NOT NULL DEFAULT '',
  -- When true this module is the cumulative final exam (no content, only questions).
  -- A course template should have exactly one is_final_exam=true module,
  -- and it should be last in sort_order.
  is_final_exam boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lms_template_modules_template_idx
  ON public.lms_template_modules(template_id, sort_order);

-- ── lms_template_questions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lms_template_questions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_module_id uuid NOT NULL REFERENCES public.lms_template_modules(id) ON DELETE CASCADE,
  sort_order         integer NOT NULL DEFAULT 0,
  question_text      text NOT NULL,
  -- Array of answer options: [{id: "a", text: "Option text"}, ...]
  -- Always exactly 4 options (A–D).
  options            jsonb NOT NULL,
  -- The id of the correct option ("a", "b", "c", or "d")
  correct_option_id  text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lms_template_questions_module_idx
  ON public.lms_template_questions(template_module_id, sort_order);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.lms_course_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_template_modules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_template_questions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read published templates (for the template picker)
CREATE POLICY "Authenticated users can read published templates"
  ON public.lms_course_templates FOR SELECT
  USING (auth.role() = 'authenticated' AND is_published = true);

-- Super-admin can read all templates (including drafts) — handled via service role
-- No client-side write policies: all writes go through service-role server actions

CREATE POLICY "Authenticated users can read published template modules"
  ON public.lms_template_modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lms_course_templates t
      WHERE t.id = template_id AND t.is_published = true
    )
  );

CREATE POLICY "Authenticated users can read published template questions"
  ON public.lms_template_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lms_template_modules m
      JOIN public.lms_course_templates t ON t.id = m.template_id
      WHERE m.id = template_module_id AND t.is_published = true
    )
  );

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.lms_course_templates IS
  'Super-admin-managed course templates. Companies clone these to create their own courses. '
  'Only is_published=true templates appear in the company template picker.';

COMMENT ON COLUMN public.lms_template_modules.is_final_exam IS
  'Marks the cumulative final exam. Should be the last module. '
  'Final exam modules have no learner content — only quiz questions.';

COMMENT ON COLUMN public.lms_template_questions.options IS
  'Array of 4 answer choices: [{id: "a", text: "..."}, {id: "b", text: "..."}, ...]';

DO $$
BEGIN
  RAISE NOTICE '✅ Created lms_course_templates, lms_template_modules, lms_template_questions';
END $$;
