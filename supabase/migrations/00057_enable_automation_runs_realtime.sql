-- Enable Supabase Realtime for automation_runs table so the client can
-- receive INSERT events and display "Automation Running" toasts.
--
-- REPLICA IDENTITY FULL is required for Supabase postgres_changes to
-- include column values (needed for client-side filtering and payload access).

alter table public.automation_runs replica identity full;

alter publication supabase_realtime add table public.automation_runs;
