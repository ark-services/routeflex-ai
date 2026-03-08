-- Migration 00098: Generic "Monitor Gmail" automation trigger
--
-- Adds a new automation trigger type 'gmail.email_received' that fires when
-- a matching email arrives in the company's connected Gmail account.
-- The cron at /api/gmail/poll-inbox polls every 5 minutes.

-- 1. Seed the new trigger type
INSERT INTO public.automation_triggers (key, name, description, payload_schema)
VALUES (
  'gmail.email_received',
  'Email received (Gmail)',
  'When a matching email is received in the connected Gmail account',
  '{"applicant_id":"uuid","email_from":"text","email_subject":"text","extracted_value":"text","gmail_message_id":"text"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- 2. Deduplication table — tracks which Gmail messages have been processed
--    per automation so the same email is never processed twice.
CREATE TABLE IF NOT EXISTS public.gmail_processed_messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  gmail_message_id text        NOT NULL,
  automation_id    uuid        REFERENCES public.automations(id) ON DELETE SET NULL,
  applicant_id     uuid        REFERENCES public.applicants(id) ON DELETE SET NULL,
  processed_at     timestamptz NOT NULL DEFAULT now(),
  metadata         jsonb       NOT NULL DEFAULT '{}',

  -- Same email can fire different automations, but not the same one twice
  UNIQUE(company_id, gmail_message_id, automation_id)
);

CREATE INDEX IF NOT EXISTS gmail_processed_messages_company_idx
  ON public.gmail_processed_messages(company_id);
