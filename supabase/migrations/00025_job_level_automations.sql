-- ============================================================================
-- JOB-LEVEL AUTOMATION ENGINE (Monday.com-style)
-- Replaces company-level automations with job-scoped automation recipes
-- ============================================================================

-- Drop old automation tables (clean slate for job-level architecture)
drop table if exists public.automation_queue cascade;
drop table if exists public.automation_runs cascade;
drop table if exists public.automation_actions cascade;
drop table if exists public.automations cascade;
drop table if exists public.automation_triggers cascade;

-- ============================================================================
-- AUTOMATION TRIGGERS (supported trigger types catalog)
-- ============================================================================

create table public.automation_triggers (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  description text,
  payload_schema jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Seed trigger types
insert into public.automation_triggers (key, name, description, payload_schema) values
  -- Applicant triggers (job-level events)
  ('applicant.created', 'Applicant Created', 'When a new applicant is added to this job', '{"company_id":"uuid","job_id":"uuid","applicant_id":"uuid","group_id":"uuid"}'::jsonb),
  ('applicant.moved_group', 'Applicant Moved to Group', 'When an applicant is moved between groups', '{"company_id":"uuid","job_id":"uuid","applicant_id":"uuid","from_group_id":"uuid","to_group_id":"uuid"}'::jsonb),
  ('applicant.status_changed', 'Applicant Status Changed', 'When an applicant status changes', '{"company_id":"uuid","job_id":"uuid","applicant_id":"uuid","from_status":"text","to_status":"text"}'::jsonb),
  ('form.submitted', 'Application Form Submitted', 'When someone submits an application for this job', '{"company_id":"uuid","job_id":"uuid","applicant_id":"uuid","form_id":"uuid"}'::jsonb),
  -- Board-level trigger (future-proofing)
  ('board.column_changed', 'Board Column Changed', 'When a column value is updated', '{"company_id":"uuid","job_id":"uuid","board_id":"uuid","applicant_id":"uuid","column_id":"uuid"}'::jsonb)

on conflict (key) do nothing;

-- ============================================================================
-- AUTOMATIONS (job-level automation recipes)
-- ============================================================================

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null,
  is_enabled boolean not null default true,
  trigger_key text not null references public.automation_triggers(key) on delete cascade,
  filter jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index automations_company_job_trigger_idx on public.automations(company_id, job_id, trigger_key);
create index automations_job_enabled_idx on public.automations(job_id, is_enabled) where is_enabled = true;

-- Auto-update updated_at trigger
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger automations_updated_at before update on public.automations
  for each row execute function public.update_updated_at_column();

-- ============================================================================
-- AUTOMATION ACTIONS (actions executed per automation recipe)
-- ============================================================================

create table public.automation_actions (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  sort_order int not null default 0,
  type text not null check (type in ('move_group', 'set_status', 'webhook', 'send_email')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index automation_actions_automation_sort_idx on public.automation_actions(automation_id, sort_order);
create index automation_actions_job_idx on public.automation_actions(job_id);

-- ============================================================================
-- AUTOMATION RUNS (job-level execution history)
-- ============================================================================

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  automation_id uuid references public.automations(id) on delete set null,
  trigger_key text not null,
  subject_type text not null,
  subject_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null check (status in ('queued', 'success', 'failed', 'skipped')),
  error text,
  created_at timestamptz not null default now()
);

create index automation_runs_job_created_idx on public.automation_runs(job_id, created_at desc);
create index automation_runs_company_created_idx on public.automation_runs(company_id, created_at desc);

-- ============================================================================
-- AUTOMATION QUEUE (for future async processing)
-- ============================================================================

create table public.automation_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  trigger_key text not null,
  subject_type text not null,
  subject_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create index automation_queue_status_run_idx on public.automation_queue(status, run_at) where status = 'queued';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Check if user is member of company
create or replace function public.is_company_member(p_company_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.companies c
    inner join public.account_memberships am on am.account_id = c.account_id
    where c.id = p_company_id
      and am.user_id = auth.uid()
  );
end;
$$ language plpgsql stable security definer;

-- Check if job belongs to company (for validation)
create or replace function public.job_belongs_to_company(p_job_id uuid, p_company_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.jobs
    where id = p_job_id
      and company_id = p_company_id
  );
end;
$$ language plpgsql stable security definer;

-- Check if user can access job (member of company that owns job)
create or replace function public.can_access_job(p_job_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.jobs j
    inner join public.companies c on c.id = j.company_id
    inner join public.account_memberships am on am.account_id = c.account_id
    where j.id = p_job_id
      and am.user_id = auth.uid()
  );
end;
$$ language plpgsql stable security definer;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

alter table public.automation_triggers enable row level security;
alter table public.automations enable row level security;
alter table public.automation_actions enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_queue enable row level security;

-- Triggers table: public read
create policy "Anyone can view trigger types"
  on public.automation_triggers for select
  using (true);

-- Automations: job-level access via company membership
create policy "Members can view job automations"
  on public.automations for select
  using (can_access_job(job_id));

create policy "Members can create job automations"
  on public.automations for insert
  with check (
    can_access_job(job_id)
    and job_belongs_to_company(job_id, company_id)
  );

create policy "Members can update job automations"
  on public.automations for update
  using (can_access_job(job_id));

create policy "Members can delete job automations"
  on public.automations for delete
  using (can_access_job(job_id));

-- Automation actions: job-level access
create policy "Members can view job automation actions"
  on public.automation_actions for select
  using (can_access_job(job_id));

create policy "Members can create job automation actions"
  on public.automation_actions for insert
  with check (
    can_access_job(job_id)
    and job_belongs_to_company(job_id, company_id)
  );

create policy "Members can update job automation actions"
  on public.automation_actions for update
  using (can_access_job(job_id));

create policy "Members can delete job automation actions"
  on public.automation_actions for delete
  using (can_access_job(job_id));

-- Automation runs: job-level read access
create policy "Members can view job automation runs"
  on public.automation_runs for select
  using (can_access_job(job_id));

-- Queue: job-level read access
create policy "Members can view job automation queue"
  on public.automation_queue for select
  using (can_access_job(job_id));

-- ============================================================================
-- VALIDATION TRIGGER (ensure job belongs to company)
-- ============================================================================

create or replace function public.validate_automation_job_company()
returns trigger as $$
begin
  if not public.job_belongs_to_company(new.job_id, new.company_id) then
    raise exception 'job_id % does not belong to company_id %', new.job_id, new.company_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger validate_automations_job_company
  before insert or update on public.automations
  for each row execute function public.validate_automation_job_company();

create trigger validate_automation_actions_job_company
  before insert or update on public.automation_actions
  for each row execute function public.validate_automation_job_company();

create trigger validate_automation_runs_job_company
  before insert or update on public.automation_runs
  for each row execute function public.validate_automation_job_company();
