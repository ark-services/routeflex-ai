-- ============================================================================
-- AUTOMATION ENGINE v2.0
-- Comprehensive automation system with trigger-action architecture
-- Replaces limited status_change-only system
-- ============================================================================

-- Drop old automation tables (clean slate)
drop table if exists public.automation_action_runs cascade;
drop table if exists public.automation_actions cascade;
drop table if exists public.automation_rules cascade;
drop table if exists public.status_change_events cascade;

-- ============================================================================
-- AUTOMATION TRIGGERS (supported trigger types)
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
  -- Applicant triggers
  ('applicant.created', 'Applicant Created', 'Fires when a new applicant is added', '{"company_id":"uuid","job_id":"uuid","board_id":"uuid","group_id":"uuid","applicant_id":"uuid"}'::jsonb),
  ('applicant.updated', 'Applicant Updated', 'Fires when applicant data is modified', '{"company_id":"uuid","job_id":"uuid","board_id":"uuid","applicant_id":"uuid"}'::jsonb),
  ('applicant.moved_group', 'Applicant Moved to Group', 'Fires when applicant is moved between groups', '{"company_id":"uuid","job_id":"uuid","board_id":"uuid","from_group_id":"uuid","to_group_id":"uuid","applicant_id":"uuid"}'::jsonb),
  ('applicant.status_changed', 'Applicant Status Changed', 'Fires when applicant status changes', '{"company_id":"uuid","job_id":"uuid","applicant_id":"uuid","old_status":"text","new_status":"text"}'::jsonb),
  ('applicant.cell_updated', 'Cell Value Updated', 'Fires when a board cell is updated', '{"company_id":"uuid","job_id":"uuid","board_id":"uuid","applicant_id":"uuid","column_id":"uuid"}'::jsonb),
  ('form.submitted', 'Application Form Submitted', 'Fires when someone submits an application', '{"company_id":"uuid","job_id":"uuid","applicant_id":"uuid","form_id":"uuid"}'::jsonb),

  -- Group triggers
  ('group.created', 'Group Created', 'Fires when a new board group is created', '{"company_id":"uuid","board_id":"uuid","group_id":"uuid"}'::jsonb),
  ('group.renamed', 'Group Renamed', 'Fires when a group is renamed', '{"company_id":"uuid","board_id":"uuid","group_id":"uuid","old_name":"text","new_name":"text"}'::jsonb),
  ('group.deleted', 'Group Deleted', 'Fires when a group is deleted', '{"company_id":"uuid","board_id":"uuid","group_id":"uuid"}'::jsonb),
  ('group.reordered', 'Group Reordered', 'Fires when groups are reordered', '{"company_id":"uuid","board_id":"uuid","group_id":"uuid"}'::jsonb),

  -- Column triggers
  ('column.created', 'Column Created', 'Fires when a new board column is created', '{"company_id":"uuid","board_id":"uuid","column_id":"uuid"}'::jsonb),
  ('column.renamed', 'Column Renamed', 'Fires when a column is renamed', '{"company_id":"uuid","board_id":"uuid","column_id":"uuid","old_name":"text","new_name":"text"}'::jsonb),
  ('column.deleted', 'Column Deleted', 'Fires when a column is deleted', '{"company_id":"uuid","board_id":"uuid","column_id":"uuid"}'::jsonb),
  ('column.hidden_changed', 'Column Visibility Changed', 'Fires when column is hidden/shown', '{"company_id":"uuid","board_id":"uuid","column_id":"uuid","is_hidden":"boolean"}'::jsonb),

  -- Job triggers
  ('job.renamed', 'Job Renamed', 'Fires when a job is renamed', '{"company_id":"uuid","job_id":"uuid","old_name":"text","new_name":"text"}'::jsonb),
  ('job.duplicated', 'Job Duplicated', 'Fires when a job is duplicated', '{"company_id":"uuid","source_job_id":"uuid","new_job_id":"uuid"}'::jsonb),
  ('job.deleted', 'Job Deleted', 'Fires when a job is deleted', '{"company_id":"uuid","job_id":"uuid"}'::jsonb),

  -- Company triggers
  ('company.renamed', 'Company Renamed', 'Fires when company is renamed', '{"company_id":"uuid","old_name":"text","new_name":"text"}'::jsonb),
  ('company.duplicated', 'Company Duplicated', 'Fires when company is duplicated', '{"source_company_id":"uuid","new_company_id":"uuid"}'::jsonb),
  ('company.deleted', 'Company Deleted', 'Fires when company is deleted', '{"company_id":"uuid"}'::jsonb)

on conflict (key) do nothing;

-- ============================================================================
-- AUTOMATIONS (company-owned automation rules)
-- ============================================================================

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  is_enabled boolean not null default true,
  trigger_key text not null references public.automation_triggers(key) on delete cascade,
  filter jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index automations_company_id_trigger_key_idx on public.automations(company_id, trigger_key);
create index automations_enabled_idx on public.automations(is_enabled) where is_enabled = true;

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
-- AUTOMATION ACTIONS (actions attached to automations)
-- ============================================================================

create table public.automation_actions (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  sort_order int not null default 0,
  type text not null check (type in ('move_group', 'set_status', 'webhook', 'send_email')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index automation_actions_automation_id_sort_order_idx on public.automation_actions(automation_id, sort_order);

-- ============================================================================
-- AUTOMATION RUNS (execution history)
-- ============================================================================

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  automation_id uuid references public.automations(id) on delete set null,
  trigger_key text not null,
  subject_type text not null,
  subject_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null check (status in ('success', 'failed', 'skipped')),
  error text,
  created_at timestamptz not null default now()
);

create index automation_runs_company_id_created_at_idx on public.automation_runs(company_id, created_at desc);
create index automation_runs_automation_id_idx on public.automation_runs(automation_id);

-- ============================================================================
-- AUTOMATION QUEUE (for future async processing)
-- ============================================================================

create table public.automation_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
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

create index automation_queue_status_run_at_idx on public.automation_queue(status, run_at) where status = 'queued';

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

alter table public.automation_triggers enable row level security;
alter table public.automations enable row level security;
alter table public.automation_actions enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_queue enable row level security;

-- Helper function: is user a member of company?
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

-- Triggers table: public read
create policy "Anyone can view trigger types"
  on public.automation_triggers for select
  using (true);

-- Automations: company members only
create policy "Members can view automations"
  on public.automations for select
  using (is_company_member(company_id));

create policy "Members can create automations"
  on public.automations for insert
  with check (is_company_member(company_id));

create policy "Members can update automations"
  on public.automations for update
  using (is_company_member(company_id));

create policy "Members can delete automations"
  on public.automations for delete
  using (is_company_member(company_id));

-- Automation actions: company members only
create policy "Members can view automation actions"
  on public.automation_actions for select
  using (is_company_member(company_id));

create policy "Members can create automation actions"
  on public.automation_actions for insert
  with check (is_company_member(company_id));

create policy "Members can update automation actions"
  on public.automation_actions for update
  using (is_company_member(company_id));

create policy "Members can delete automation actions"
  on public.automation_actions for delete
  using (is_company_member(company_id));

-- Automation runs: company members (read only)
create policy "Members can view automation runs"
  on public.automation_runs for select
  using (is_company_member(company_id));

-- Queue: company members (read only)
create policy "Members can view automation queue"
  on public.automation_queue for select
  using (is_company_member(company_id));
