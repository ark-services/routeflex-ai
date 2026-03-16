-- Migration: 00122_automation_agents
-- Adds agent grouping layer for automations.

-- 1. Create the automation_agents table
CREATE TABLE automation_agents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name        text NOT NULL,
  emoji       text NOT NULL DEFAULT '🤖',
  sort_order  int NOT NULL DEFAULT 0,
  is_enabled  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for the primary query pattern
CREATE INDEX idx_automation_agents_job ON automation_agents(company_id, job_id);

-- Auto-update updated_at
CREATE TRIGGER set_automation_agents_updated_at
  BEFORE UPDATE ON automation_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE automation_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view agents"
  ON automation_agents FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY "Company members can insert agents"
  ON automation_agents FOR INSERT
  WITH CHECK (is_company_member(company_id));

CREATE POLICY "Company members can update agents"
  ON automation_agents FOR UPDATE
  USING (is_company_member(company_id));

CREATE POLICY "Company members can delete agents"
  ON automation_agents FOR DELETE
  USING (is_company_member(company_id));

-- 2. Add nullable agent_id FK to automations (ON DELETE SET NULL so deleting
--    an agent unassigns its automations rather than cascade-deleting them)
ALTER TABLE automations
  ADD COLUMN agent_id uuid REFERENCES automation_agents(id) ON DELETE SET NULL;

CREATE INDEX idx_automations_agent ON automations(agent_id);
