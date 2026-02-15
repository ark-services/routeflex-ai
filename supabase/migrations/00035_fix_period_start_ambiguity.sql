-- ============================================================================
-- Fix "column reference period_start is ambiguous" error
-- The issue: period_start exists as both a variable and a table column
-- Solution: Properly qualify all column references
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
) as $$
declare
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_quota int;
  v_plan_type text;
  v_period_exists boolean;
begin
  -- Get billing period
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
$$ language plpgsql;

-- ============================================================================
-- Also fix record_action_usage to use qualified column names
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
) returns uuid as $$
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
$$ language plpgsql security definer;

-- ============================================================================
-- Success
-- ============================================================================

do $$
begin
  raise notice '✅ Fixed column ambiguity in get_or_create_action_period and record_action_usage';
  raise notice '   - Added table aliases (aap, bp) to all queries';
  raise notice '   - Qualified all column references to avoid ambiguity';
  raise notice '   - Changed period_exists variable name to v_period_exists';
end $$;
