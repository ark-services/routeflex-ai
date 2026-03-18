-- Migration 00127: Enable RLS on gmail_processed_messages
--
-- This table was missing RLS (flagged by Supabase Security Advisor).
-- All writes come from the service role (cron job), so only a SELECT
-- policy is needed for authenticated company members.

ALTER TABLE public.gmail_processed_messages ENABLE ROW LEVEL SECURITY;

-- Company members can view dedup records for their company
CREATE POLICY "Company members can view gmail processed messages"
  ON public.gmail_processed_messages
  FOR SELECT
  TO authenticated
  USING (public.is_company_member(company_id));
