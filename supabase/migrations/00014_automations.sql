-- Create boards table if it doesn't exist (referenced in automation_rules)
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Status change events (trigger source)
create table public.status_change_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  column_id uuid not null references public.board_columns(id) on delete cascade,
  old_status_label_id uuid references public.board_status_labels(id) on delete set null,
  new_status_label_id uuid references public.board_status_labels(id) on delete set null,
  triggered_by_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index status_change_events_account_id_idx on public.status_change_events(account_id);
create index status_change_events_occurred_at_idx on public.status_change_events(occurred_at desc);

-- Automation rules
create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  is_enabled boolean not null default true,
  trigger_type text not null default 'status_change' check (trigger_type = 'status_change'),
  trigger_column_id uuid not null references public.board_columns(id) on delete cascade,
  trigger_to_status_label_id uuid not null references public.board_status_labels(id) on delete cascade,
  trigger_from_status_label_id uuid references public.board_status_labels(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index automation_rules_account_id_idx on public.automation_rules(account_id);
create index automation_rules_enabled_idx on public.automation_rules(is_enabled) where is_enabled = true;

-- Automation actions (ordered list per rule)
create table public.automation_actions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  action_type text not null check (action_type in ('send_gmail', 'send_sms', 'send_slack', 'move_to_group')),
  sort_order int not null default 0,
  config jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index automation_actions_rule_id_idx on public.automation_actions(rule_id, sort_order);

-- Action execution runs (idempotency via unique constraint)
create table public.automation_action_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.status_change_events(id) on delete cascade,
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  action_id uuid not null references public.automation_actions(id) on delete cascade,
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null check (status in ('pending', 'success', 'failed', 'paused_quota')),
  error_message text,
  cost_units int not null default 1,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(event_id, rule_id, action_id)
);

create index automation_action_runs_account_id_idx on public.automation_action_runs(account_id);
create index automation_action_runs_status_idx on public.automation_action_runs(status);

-- Enable RLS
alter table public.status_change_events enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_actions enable row level security;
alter table public.automation_action_runs enable row level security;

-- RLS Policies
create policy "Members can view events" on public.status_change_events for select
  using (account_id in (select account_id from public.account_memberships where user_id = auth.uid()));

create policy "Members can manage rules" on public.automation_rules for all
  using (account_id in (select account_id from public.account_memberships where user_id = auth.uid() and role in ('admin', 'member')));

create policy "Members can view runs" on public.automation_action_runs for select
  using (account_id in (select account_id from public.account_memberships where user_id = auth.uid()));

-- Add foreign keys to ledger
alter table public.account_action_ledger
  add constraint account_action_ledger_rule_id_fkey foreign key (rule_id) references public.automation_rules(id) on delete set null,
  add constraint account_action_ledger_action_id_fkey foreign key (action_id) references public.automation_actions(id) on delete set null,
  add constraint account_action_ledger_event_id_fkey foreign key (event_id) references public.status_change_events(id) on delete set null;
