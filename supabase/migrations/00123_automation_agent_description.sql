-- Migration: 00123_automation_agent_description
-- Adds a short description field to automation_agents.

ALTER TABLE automation_agents
  ADD COLUMN description text NOT NULL DEFAULT '';
