-- Migration 00099: Job Knowledge Base
--
-- Q&A entries per job that recruiters maintain. Used by AI-powered automations
-- (email, SMS, phone) as context when communicating with applicants.

CREATE TABLE IF NOT EXISTS public.job_knowledge_base (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  question    text NOT NULL DEFAULT '',
  answer      text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for page-level queries (all entries for a job)
CREATE INDEX IF NOT EXISTS job_knowledge_base_job_idx
  ON public.job_knowledge_base(job_id);

-- Trigger to auto-update updated_at
CREATE TRIGGER job_knowledge_base_updated_at
  BEFORE UPDATE ON public.job_knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.job_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can select knowledge base entries"
  ON public.job_knowledge_base FOR SELECT
  USING (public.is_company_member(company_id));

CREATE POLICY "Company members can insert knowledge base entries"
  ON public.job_knowledge_base FOR INSERT
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY "Company members can update knowledge base entries"
  ON public.job_knowledge_base FOR UPDATE
  USING (public.is_company_member(company_id));

CREATE POLICY "Company members can delete knowledge base entries"
  ON public.job_knowledge_base FOR DELETE
  USING (public.is_company_member(company_id));

DO $$
BEGIN
  RAISE NOTICE '✅ Created job_knowledge_base table with RLS policies';
END $$;
