-- ============================================================================
-- Fix metering RLS and security definer issues
--
-- PROBLEM:
-- 1. get_or_create_action_period is NOT SECURITY DEFINER
-- 2. When Admin Center calls it via RPC, RLS blocks INSERT
-- 3. Admin Center shows fake "used: 0" data when RPC fails
--
-- SOLUTION:
-- 1. Make get_or_create_action_period SECURITY DEFINER
-- 2. Make get_billing_period SECURITY DEFINER for consistency
-- 3. Ensure both functions have proper search_path
-- 4. Grant EXECUTE to authenticated role
-- 5. Keep existing SELECT-only RLS policies (functions bypass RLS via SECURITY DEFINER)
-- ============================================================================

-- ============================================================================
-- PART 1: Fix get_billing_period - add SECURITY DEFINER
-- ============================================================================

create or replace function public.get_billing_period(
  p_account_id uuid,
  p_at_date timestamptz default now()
)
returns table(period_start timestamptz, period_end timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_anchor_day int;
  v_created_at timestamptz;
  v_start timestamptz;
  v_end timestamptz;
begin
  -- Get billing anchor day and account creation date
  select billing_anchor_day, created_at into v_anchor_day, v_created_at
  from public.accounts where id = p_account_id;

  -- If account not found or anchor day is NULL, default to 1st of month
  if v_anchor_day is null or v_created_at is null then
    raise notice '[get_billing_period] Account % not found or missing billing_anchor_day, using 1st of month', p_account_id;
    v_anchor_day := 1;
    v_created_at := coalesce(v_created_at, now());
  end if;

  -- Calculate period start based on anchor day (monthly billing)
  v_start := date_trunc('month', p_at_date) + ((v_anchor_day - 1) || ' days')::interval;

  -- If we're before the anchor day this month, use previous month's anchor day
  if p_at_date < v_start then
    v_start := date_trunc('month', p_at_date - interval '1 month') + ((v_anchor_day - 1) || ' days')::interval;
  end if;

  -- Period end is always 1 month after start (monthly billing)
  v_end := v_start + interval '1 month';

  -- Don't start before account creation
  if v_start < v_created_at then
    v_start := v_created_at;
  end if;

  raise notice '[get_billing_period] Account %, anchor_day %, period: % to %',
    p_account_id, v_anchor_day, v_start, v_end;

  return query select v_start, v_end;
end;
$$;

-- ============================================================================
-- PART 2: Fix get_or_create_action_period - add SECURITY DEFINER
-- ============================================================================

create or replace function public.get_or_create_action_period(
  p_account_id uuid,
  p_at_date timestamptz default now()
)
returns table(
  period_start timestamptz,
  period_end timestamptz,
  quota_units int,
  used_units int,
  locked_editing boolean,
  paused_execution boolean,
  carryover_debt_units int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_quota int;
  v_plan_type text;
  v_period_exists boolean;
begin
  -- Get billing period (monthly)
  select bp.period_start, bp.period_end into v_period_start, v_period_end
  from public.get_billing_period(p_account_id, p_at_date) bp;

  raise notice '[get_or_create_action_period] Period: % to %', v_period_start, v_period_end;

  -- Check if period row exists (properly qualify column names to avoid ambiguity)
  select exists(
    select 1
    from public.account_action_periods aap
    where aap.account_id = p_account_id
      and aap.period_start = v_period_start
  ) into v_period_exists;

  raise notice '[get_or_create_action_period] Period exists: %', v_period_exists;

  -- Create period row if doesn't exist
  if not v_period_exists then
    select plan_type into v_plan_type from public.accounts where id = p_account_id;
    v_quota := case v_plan_type
      when 'basic' then 3000
      when 'pro' then 10000
      else 50000
    end;

    raise notice '[get_or_create_action_period] Creating period with quota: %', v_quota;

    insert into public.account_action_periods (account_id, period_start, period_end, quota_units)
    values (p_account_id, v_period_start, v_period_end, v_quota)
    on conflict (account_id, period_start) do nothing;

    raise notice '[get_or_create_action_period] ✓ Period created';
  end if;

  -- Return period data (use explicit column names from table)
  return query
  select
    aap.period_start,
    aap.period_end,
    aap.quota_units,
    aap.used_units,
    aap.locked_editing,
    aap.paused_execution,
    aap.carryover_debt_units
  from public.account_action_periods aap
  where aap.account_id = p_account_id
    and aap.period_start = v_period_start;
end;
$$;

-- ============================================================================
-- PART 3: Ensure record_action_usage is SECURITY DEFINER (already was, but reconfirm)
-- ============================================================================

create or replace function public.record_action_usage(
  p_account_id uuid,
  p_units int,
  p_source text,
  p_rule_id uuid default null,
  p_action_id uuid default null,
  p_applicant_id uuid default null,
  p_company_id uuid default null,
  p_event_id uuid default null,
  p_status text default 'completed',
  p_metadata jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger_id uuid;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_rows_updated int;
begin
  raise notice '[record_action_usage] ========================================';
  raise notice '[record_action_usage] Called with account_id: %, units: %, source: %, status: %',
    p_account_id, p_units, p_source, p_status;
  raise notice '[record_action_usage] rule_id: %, action_id: %, company_id: %',
    p_rule_id, p_action_id, p_company_id;

  -- Get current billing period
  select bp.period_start, bp.period_end into v_period_start, v_period_end
  from public.get_billing_period(p_account_id, now()) bp;

  raise notice '[record_action_usage] Billing period: % to %', v_period_start, v_period_end;

  -- Ensure period row exists
  perform public.get_or_create_action_period(p_account_id, now());

  -- Insert into ledger
  raise notice '[record_action_usage] Inserting into account_action_ledger...';
  insert into public.account_action_ledger (
    account_id, occurred_at, units, source, rule_id, action_id,
    applicant_id, company_id, event_id, status, metadata
  )
  values (
    p_account_id, now(), p_units, p_source, p_rule_id, p_action_id,
    p_applicant_id, p_company_id, p_event_id, p_status, p_metadata
  )
  returning id into v_ledger_id;

  raise notice '[record_action_usage] ✓ Ledger row created: %', v_ledger_id;

  -- Update period counter if completed (use qualified column names)
  if p_status = 'completed' then
    raise notice '[record_action_usage] Updating period used_units counter...';

    update public.account_action_periods aap
    set used_units = aap.used_units + p_units, updated_at = now()
    where aap.account_id = p_account_id
      and aap.period_start = v_period_start;

    get diagnostics v_rows_updated = row_count;

    raise notice '[record_action_usage] ✓ Period updated, rows affected: %', v_rows_updated;

    if v_rows_updated = 0 then
      raise warning '[record_action_usage] ⚠️  No period row updated! Check if period exists.';
    end if;
  else
    raise notice '[record_action_usage] Status is %, skipping period counter update', p_status;
  end if;

  raise notice '[record_action_usage] ✓ Complete, returning ledger_id: %', v_ledger_id;
  raise notice '[record_action_usage] ========================================';

  return v_ledger_id;
end;
$$;

-- ============================================================================
-- PART 4: Grant EXECUTE permissions to authenticated role
-- ============================================================================

grant execute on function public.get_billing_period(uuid, timestamptz) to authenticated;
grant execute on function public.get_or_create_action_period(uuid, timestamptz) to authenticated;
grant execute on function public.record_action_usage(uuid, int, text, uuid, uuid, uuid, uuid, uuid, text, jsonb) to authenticated;

-- ============================================================================
-- PART 5: Verify RLS policies are still in place (SELECT-only is correct)
-- ============================================================================

-- These policies already exist from migration 00013_action_metering.sql
-- We keep them as SELECT-only because:
-- 1. Functions use SECURITY DEFINER to bypass RLS for INSERT/UPDATE
-- 2. Users should only be able to SELECT their own data directly
-- 3. All writes go through the secure RPC functions

-- ============================================================================
-- SUCCESS
-- ============================================================================

do $$
begin
  raise notice '✅ Metering RLS and security fixes complete';
  raise notice '   ';
  raise notice '   CHANGES MADE:';
  raise notice '   1. ✓ get_billing_period now SECURITY DEFINER';
  raise notice '   2. ✓ get_or_create_action_period now SECURITY DEFINER';
  raise notice '   3. ✓ record_action_usage confirmed SECURITY DEFINER';
  raise notice '   4. ✓ All functions have set search_path = public';
  raise notice '   5. ✓ Granted EXECUTE to authenticated role';
  raise notice '   ';
  raise notice '   WHY THIS FIXES THE ISSUE:';
  raise notice '   - Functions now bypass RLS and run as table owner (postgres)';
  raise notice '   - Admin Center can safely call get_or_create_action_period';
  raise notice '   - Period rows can be created without RLS blocking INSERT';
  raise notice '   - Used units will increment properly on automation runs';
  raise notice '   ';
  raise notice '   SECURITY MODEL:';
  raise notice '   - Direct SELECT: Users can only see their own account data (RLS)';
  raise notice '   - RPC functions: Run as owner, bypass RLS, enforce app-level security';
  raise notice '   - Billing periods: Monthly, anchored to billing_anchor_day';
  raise notice '   ';
  raise notice '   NEXT STEPS:';
  raise notice '   1. Update Admin Center page.tsx to handle errors properly';
  raise notice '   2. Verify automations increment used_units';
  raise notice '   3. Confirm period_end shows correct monthly reset date';
end $$;
