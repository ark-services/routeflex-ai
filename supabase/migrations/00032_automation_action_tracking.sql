-- ============================================================================
-- Add action execution tracking to automation_runs
-- Track detailed metrics for each automation run
-- ============================================================================

-- Add action tracking columns to automation_runs
alter table public.automation_runs
  add column if not exists actions_attempted int default 0,
  add column if not exists actions_succeeded int default 0,
  add column if not exists actions_failed int default 0,
  add column if not exists duration_ms int,
  add column if not exists action_results jsonb default '[]'::jsonb;

-- Add comments
comment on column public.automation_runs.actions_attempted is
  'Total number of actions that were attempted to execute';
comment on column public.automation_runs.actions_succeeded is
  'Number of actions that completed successfully';
comment on column public.automation_runs.actions_failed is
  'Number of actions that failed during execution';
comment on column public.automation_runs.duration_ms is
  'Total execution time in milliseconds for this automation run';
comment on column public.automation_runs.action_results is
  'Detailed results for each action executed: [{action_id, type, status, error, duration_ms}]';

-- Add index for filtering by action counts (useful for debugging)
create index if not exists automation_runs_actions_idx
  on public.automation_runs(actions_attempted, actions_succeeded, actions_failed)
  where status = 'success';

-- Add job_id column if missing (for job-level automations)
alter table public.automation_runs
  add column if not exists job_id uuid references public.jobs(id) on delete cascade;

create index if not exists automation_runs_job_id_idx
  on public.automation_runs(job_id, created_at desc)
  where job_id is not null;

comment on column public.automation_runs.job_id is
  'Reference to job for job-level automations (null for company-level)';
