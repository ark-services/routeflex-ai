-- Migration: Add skip_reason column to automation_runs for debugging
-- Allows the automation engine to record WHY a run was skipped

alter table public.automation_runs
  add column if not exists skip_reason text;

comment on column public.automation_runs.skip_reason is
  'Human-readable explanation of why this automation run was skipped. Null if run was not skipped (status=success or failed).';

-- Add index for debugging queries
create index if not exists automation_runs_status_skip_idx
  on public.automation_runs(status, skip_reason)
  where status = 'skipped';
