-- Migration 00103: System notifications table + automation trigger
--
-- Lightweight notification system for surfacing system events (e.g. unmatched
-- FADV emails, integration errors) via automation actions (email, Slack, etc.).

-- 1. System notifications table
CREATE TABLE IF NOT EXISTS public.system_notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id        uuid        REFERENCES public.jobs(id) ON DELETE SET NULL,
  type          text        NOT NULL DEFAULT 'info',
  title         text        NOT NULL,
  body          text,
  metadata      jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz
);

CREATE INDEX IF NOT EXISTS system_notifications_company_created_idx
  ON public.system_notifications(company_id, created_at DESC);

ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view notifications"
  ON public.system_notifications FOR SELECT
  USING (is_company_member(company_id));

-- Service role inserts (no INSERT policy needed — service role bypasses RLS)

-- 2. Seed the automation trigger type
INSERT INTO public.automation_triggers (key, name, description, payload_schema)
VALUES (
  'system.notification_created',
  'System notification',
  'When a system notification is created (e.g., unmatched email, integration error)',
  '{"notification_id":"uuid","type":"text","title":"text","body":"text"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
