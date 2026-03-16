-- Migration: 00124_kb_agents
-- Adds agent assignment to KB entries (many-to-many) and a suggestions queue.

-- ── 1. Junction table: KB entry ↔ agent ──────────────────────────────────────
CREATE TABLE job_kb_entry_agents (
  entry_id  uuid NOT NULL REFERENCES job_knowledge_base(id) ON DELETE CASCADE,
  agent_id  uuid NOT NULL REFERENCES automation_agents(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, agent_id)
);

CREATE INDEX idx_job_kb_entry_agents_agent ON job_kb_entry_agents(agent_id);

ALTER TABLE job_kb_entry_agents ENABLE ROW LEVEL SECURITY;

-- RLS: look up company_id via the parent KB entry
CREATE POLICY "Company members can manage kb entry agents"
  ON job_kb_entry_agents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM job_knowledge_base k
      WHERE k.id = job_kb_entry_agents.entry_id
        AND is_company_member(k.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM job_knowledge_base k
      WHERE k.id = job_kb_entry_agents.entry_id
        AND is_company_member(k.company_id)
    )
  );

-- ── 2. Suggestions table ──────────────────────────────────────────────────────
CREATE TABLE job_kb_suggestions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id    uuid REFERENCES automation_agents(id) ON DELETE SET NULL,
  question    text NOT NULL DEFAULT '',
  answer      text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_kb_suggestions_job ON job_kb_suggestions(job_id, status);

ALTER TABLE job_kb_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage kb suggestions"
  ON job_kb_suggestions
  FOR ALL
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

CREATE TRIGGER set_job_kb_suggestions_updated_at
  BEFORE UPDATE ON job_kb_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
