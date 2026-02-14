-- Append-only action ledger (audit trail)
create table public.account_action_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  units int not null default 1 check (units >= 0),
  source text not null check (source in ('automation', 'manual', 'system', 'refund')),
  rule_id uuid,
  action_id uuid,
  applicant_id uuid references public.applicants(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  event_id uuid,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'refunded')),
  metadata jsonb default '{}'
);

create index account_action_ledger_account_id_idx on public.account_action_ledger(account_id);
create index account_action_ledger_occurred_at_idx on public.account_action_ledger(occurred_at desc);

-- Quota tracking per billing period
create table public.account_action_periods (
  account_id uuid not null references public.accounts(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  quota_units int not null default 3000, -- basic plan quota
  used_units int not null default 0 check (used_units >= 0),
  locked_editing boolean not null default false,
  paused_execution boolean not null default false,
  carryover_debt_units int not null default 0 check (carryover_debt_units >= 0),
  updated_at timestamptz not null default now(),
  primary key (account_id, period_start)
);

create index account_action_periods_period_end_idx on public.account_action_periods(period_end);

-- Enable RLS
alter table public.account_action_ledger enable row level security;
alter table public.account_action_periods enable row level security;

create policy "Users can view their account action ledger" on public.account_action_ledger for select
  using (account_id in (select account_id from public.account_memberships where user_id = auth.uid()));

create policy "Users can view their account action periods" on public.account_action_periods for select
  using (account_id in (select account_id from public.account_memberships where user_id = auth.uid()));

-- Helper: Get or create current period
create or replace function public.get_or_create_action_period(p_account_id uuid, p_at_date timestamptz default now())
returns table(
  period_start timestamptz, period_end timestamptz, quota_units int, used_units int,
  locked_editing boolean, paused_execution boolean, carryover_debt_units int
) as $$
declare
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_quota int;
  v_plan_type text;
  period_exists boolean;
begin
  select bp.period_start, bp.period_end into v_period_start, v_period_end
  from public.get_billing_period(p_account_id, p_at_date) bp;

  select exists(select 1 from public.account_action_periods where account_id = p_account_id and period_start = v_period_start) into period_exists;

  if not period_exists then
    select plan_type into v_plan_type from public.accounts where id = p_account_id;
    v_quota := case v_plan_type when 'basic' then 3000 when 'pro' then 10000 else 50000 end;

    insert into public.account_action_periods (account_id, period_start, period_end, quota_units)
    values (p_account_id, v_period_start, v_period_end, v_quota)
    on conflict (account_id, period_start) do nothing;
  end if;

  return query select aap.period_start, aap.period_end, aap.quota_units, aap.used_units,
    aap.locked_editing, aap.paused_execution, aap.carryover_debt_units
  from public.account_action_periods aap
  where aap.account_id = p_account_id and aap.period_start = v_period_start;
end;
$$ language plpgsql;

-- Helper: Record action usage (transactional)
create or replace function public.record_action_usage(
  p_account_id uuid, p_units int, p_source text, p_rule_id uuid default null,
  p_action_id uuid default null, p_applicant_id uuid default null,
  p_company_id uuid default null, p_event_id uuid default null,
  p_status text default 'completed', p_metadata jsonb default '{}'
) returns uuid as $$
declare
  v_ledger_id uuid;
  v_period_start timestamptz;
begin
  select period_start into v_period_start from public.get_billing_period(p_account_id, now());
  perform public.get_or_create_action_period(p_account_id, now());

  insert into public.account_action_ledger (account_id, occurred_at, units, source, rule_id, action_id, applicant_id, company_id, event_id, status, metadata)
  values (p_account_id, now(), p_units, p_source, p_rule_id, p_action_id, p_applicant_id, p_company_id, p_event_id, p_status, p_metadata)
  returning id into v_ledger_id;

  if p_status = 'completed' then
    update public.account_action_periods
    set used_units = used_units + p_units, updated_at = now()
    where account_id = p_account_id and period_start = v_period_start;
  end if;

  return v_ledger_id;
end;
$$ language plpgsql security definer;
