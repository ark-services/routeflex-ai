-- Migration 00114: Allow company members to mark notifications as read
--
-- The original 00103 migration only added a SELECT policy. Without an UPDATE
-- policy, calls to stamp read_at from the authenticated client silently affect
-- 0 rows, so the unread badge reappears on every page refresh.

CREATE POLICY "Company members can mark notifications read"
  ON public.system_notifications FOR UPDATE
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));
