-- Migration: 00096_applicants_realtime
--
-- Enable Supabase Realtime for the applicants table so the board can
-- receive live INSERT events (e.g. from the Zapier inbound webhook)
-- without requiring a manual page refresh.

ALTER PUBLICATION supabase_realtime ADD TABLE public.applicants;

DO $$
BEGIN
  RAISE NOTICE '  applicants added to supabase_realtime publication';
END $$;
