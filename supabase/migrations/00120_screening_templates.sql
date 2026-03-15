-- Migration: 00120_screening_templates
--
-- Super-admin managed reusable screening question templates.
-- Any authenticated user can read active templates.
-- Writes require service role (super-admin only).

CREATE TABLE public.screening_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.screening_template_questions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id           uuid        NOT NULL REFERENCES public.screening_templates(id) ON DELETE CASCADE,
  sort_order            integer     NOT NULL DEFAULT 0,
  text                  text        NOT NULL,
  type                  text        NOT NULL CHECK (type IN ('multiple_choice','short_text','yes_no','number')),
  options               jsonb,
  is_dealbreaker        boolean     NOT NULL DEFAULT false,
  dealbreaker_condition jsonb,
  ai_scoring_guidance   text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX screening_template_questions_template_id_idx
  ON public.screening_template_questions(template_id);

ALTER TABLE public.screening_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screening_template_questions ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read active templates (for the template picker)
CREATE POLICY "Authenticated users can view active screening templates"
  ON public.screening_templates FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);

CREATE POLICY "Authenticated users can view screening template questions"
  ON public.screening_template_questions FOR SELECT
  USING (
    template_id IN (
      SELECT id FROM public.screening_templates WHERE is_active = true
    )
  );

-- Writes via service role (super-admin) only — no INSERT/UPDATE/DELETE policies

DO $$
BEGIN
  RAISE NOTICE '✅ Created screening_templates and screening_template_questions tables';
END $$;
