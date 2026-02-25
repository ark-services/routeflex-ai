-- ============================================================================
-- Subscription Plans
-- Adds a subscription_plans table and wires it into accounts.
-- Plans: free, basic, pro, enterprise
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Create subscription_plans table
-- ----------------------------------------------------------------------------
create table public.subscription_plans (
  id                   text    primary key,  -- 'free' | 'basic' | 'pro' | 'enterprise'
  name                 text    not null,
  price_cents          int     not null default 0,
  max_seats            int     not null,           -- -1 = unlimited
  max_companies        int     not null,           -- -1 = unlimited
  max_jobs_per_company int     not null,           -- -1 = unlimited
  actions_per_month    int     not null,
  template_access      boolean not null default false,
  lms_access           boolean not null default false
);

alter table public.subscription_plans enable row level security;

create policy "Authenticated users can read plans"
  on public.subscription_plans for select
  using (auth.role() = 'authenticated');

-- Seed plan data
insert into public.subscription_plans
  (id, name, price_cents, max_seats, max_companies, max_jobs_per_company, actions_per_month, template_access, lms_access)
values
  ('free',       'Free',       0,     1,   1,   1,   1000,  false, false),
  ('basic',      'Basic',      1900,  3,   3,   3,   5000,  true,  false),
  ('pro',        'Pro',        4900,  5,   10,  10,  25000, true,  true),
  ('enterprise', 'Enterprise', 19900, 10,  -1,  -1,  50000, true,  true);

do $$ begin
  raise notice '✅ Created subscription_plans table with 4 plans';
end $$;

-- ----------------------------------------------------------------------------
-- 2. Update accounts.plan_type check constraint to include 'free'
--    and change default to 'free' for new signups
-- ----------------------------------------------------------------------------
alter table public.accounts drop constraint accounts_plan_type_check;

alter table public.accounts
  add constraint accounts_plan_type_check
  check (plan_type in ('free', 'basic', 'pro', 'enterprise'));

alter table public.accounts
  alter column plan_type set default 'free';

do $$ begin
  raise notice '✅ Updated accounts.plan_type constraint (added free, changed default)';
end $$;

-- ----------------------------------------------------------------------------
-- 3. Backfill accounts.max_seats from subscription_plans
--    (existing accounts have stale max_seats from account creation defaults)
-- ----------------------------------------------------------------------------
update public.accounts a
set max_seats = case when sp.max_seats = -1 then 999999 else sp.max_seats end
from public.subscription_plans sp
where sp.id = a.plan_type;

do $$ begin
  raise notice '✅ Backfilled accounts.max_seats from plan data';
end $$;

-- ----------------------------------------------------------------------------
-- 4. Add extra_credits column to account_action_periods
--    Super Admin can add bonus credits on top of the plan quota
-- ----------------------------------------------------------------------------
alter table public.account_action_periods
  add column if not exists extra_credits int not null default 0
  check (extra_credits >= 0);

do $$ begin
  raise notice '✅ Added extra_credits to account_action_periods';
end $$;

-- ----------------------------------------------------------------------------
-- 5. Trigger: sync max_seats + lms_enabled when plan_type changes
-- ----------------------------------------------------------------------------
create or replace function public.on_account_plan_changed()
returns trigger as $$
declare
  v_plan public.subscription_plans%rowtype;
begin
  select * into v_plan from public.subscription_plans where id = new.plan_type;

  -- Sync max_seats (store 999999 as sentinel for unlimited)
  new.max_seats := case when v_plan.max_seats = -1 then 999999 else v_plan.max_seats end;

  -- Sync lms_enabled on all companies for this account
  update public.companies
  set lms_enabled = v_plan.lms_access
  where account_id = new.id;

  raise notice '[on_account_plan_changed] Account % → plan %, max_seats %, lms_access %',
    new.id, new.plan_type, new.max_seats, v_plan.lms_access;

  return new;
end;
$$ language plpgsql security definer;

create trigger trg_account_plan_changed
  before update of plan_type on public.accounts
  for each row
  when (old.plan_type is distinct from new.plan_type)
  execute function public.on_account_plan_changed();

do $$ begin
  raise notice '✅ Created trg_account_plan_changed trigger';
end $$;

-- ----------------------------------------------------------------------------
-- 6. Helper: get_account_plan_limits(account_id)
--    Returns the plan limits row for an account
-- ----------------------------------------------------------------------------
create or replace function public.get_account_plan_limits(p_account_id uuid)
returns table(
  plan_id              text,
  plan_name            text,
  price_cents          int,
  max_seats            int,
  max_companies        int,
  max_jobs_per_company int,
  actions_per_month    int,
  template_access      boolean,
  lms_access           boolean
) as $$
begin
  return query
  select
    sp.id,
    sp.name,
    sp.price_cents,
    sp.max_seats,
    sp.max_companies,
    sp.max_jobs_per_company,
    sp.actions_per_month,
    sp.template_access,
    sp.lms_access
  from public.accounts a
  join public.subscription_plans sp on sp.id = a.plan_type
  where a.id = p_account_id;
end;
$$ language plpgsql stable security definer;

-- ----------------------------------------------------------------------------
-- 7. Helper: can_create_company(account_id) → boolean
-- ----------------------------------------------------------------------------
create or replace function public.can_create_company(p_account_id uuid)
returns boolean as $$
declare
  v_max     int;
  v_current int;
begin
  select sp.max_companies into v_max
  from public.accounts a
  join public.subscription_plans sp on sp.id = a.plan_type
  where a.id = p_account_id;

  if v_max is null then return false; end if;
  if v_max = -1   then return true;  end if;

  select count(*) into v_current
  from public.companies
  where account_id = p_account_id;

  return v_current < v_max;
end;
$$ language plpgsql stable security definer;

-- ----------------------------------------------------------------------------
-- 8. Helper: can_create_job(company_id) → boolean
-- ----------------------------------------------------------------------------
create or replace function public.can_create_job(p_company_id uuid)
returns boolean as $$
declare
  v_account_id uuid;
  v_max        int;
  v_current    int;
begin
  select account_id into v_account_id
  from public.companies where id = p_company_id;

  if v_account_id is null then return false; end if;

  select sp.max_jobs_per_company into v_max
  from public.accounts a
  join public.subscription_plans sp on sp.id = a.plan_type
  where a.id = v_account_id;

  if v_max is null then return false; end if;
  if v_max = -1   then return true;  end if;

  select count(*) into v_current
  from public.jobs
  where company_id = p_company_id;

  return v_current < v_max;
end;
$$ language plpgsql stable security definer;

-- ----------------------------------------------------------------------------
-- 9. Helper: can_add_member(account_id) → boolean
-- ----------------------------------------------------------------------------
create or replace function public.can_add_member(p_account_id uuid)
returns boolean as $$
declare
  v_max     int;
  v_current int;
begin
  select sp.max_seats into v_max
  from public.accounts a
  join public.subscription_plans sp on sp.id = a.plan_type
  where a.id = p_account_id;

  if v_max is null then return false; end if;
  if v_max = -1   then return true;  end if;

  select count(*) into v_current
  from public.account_memberships
  where account_id = p_account_id;

  return v_current < v_max;
end;
$$ language plpgsql stable security definer;

do $$ begin
  raise notice '✅ Created helper functions: get_account_plan_limits, can_create_company, can_create_job, can_add_member';
end $$;

-- ============================================================================
-- Summary
-- ============================================================================
do $$ begin
  raise notice '';
  raise notice '════════════════════════════════════════════════════';
  raise notice '  00082_subscription_plans complete';
  raise notice '  Plans: free / basic / pro / enterprise';
  raise notice '  Trigger: trg_account_plan_changed syncs max_seats + lms_enabled';
  raise notice '  Helpers: get_account_plan_limits, can_create_company, can_create_job, can_add_member';
  raise notice '════════════════════════════════════════════════════';
end $$;
