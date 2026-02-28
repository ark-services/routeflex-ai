-- ============================================================================
-- Fix get_or_create_action_period: resolve "period_start is ambiguous" error
--
-- ROOT CAUSE:
-- The function declares `RETURNS TABLE(period_start timestamptz, ...)` which
-- makes `period_start` an implicit OUT parameter (variable) in scope throughout
-- the entire function body.
--
-- Inside the body, `INSERT ... ON CONFLICT (account_id, period_start)` uses
-- `period_start` as an unqualified column name in the conflict target list.
-- PostgreSQL cannot distinguish between:
--   (a) the column `period_start` on table `account_action_periods`
--   (b) the OUT parameter variable `period_start` of the function
-- ...and correctly raises "column reference period_start is ambiguous".
--
-- SOLUTION:
-- Replace `ON CONFLICT (account_id, period_start)` with
-- `ON CONFLICT ON CONSTRAINT account_action_periods_pkey` — this references
-- the constraint by name and never mentions the column, so there is no
-- ambiguity.
--
-- Also restores SECURITY DEFINER + set search_path = public that were dropped
-- when migration 00083 recreated this function.
-- ============================================================================

drop function if exists public.get_or_create_action_period(uuid, timestamptz);

create or replace function public.get_or_create_action_period(
  p_account_id uuid,
  p_at_date    timestamptz default now()
)
returns table(
  period_start         timestamptz,
  period_end           timestamptz,
  quota_units          int,
  used_units           int,
  extra_credits        int,
  locked_editing       boolean,
  paused_execution     boolean,
  carryover_debt_units int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_start  timestamptz;
  v_period_end    timestamptz;
  v_quota         int;
  v_period_exists boolean;
begin
  -- Get billing period
  select bp.period_start, bp.period_end
  into v_period_start, v_period_end
  from public.get_billing_period(p_account_id, p_at_date) bp;

  raise notice '[get_or_create_action_period] Period: % to %', v_period_start, v_period_end;

  -- Check if period row exists
  select exists(
    select 1
    from public.account_action_periods aap
    where aap.account_id = p_account_id
      and aap.period_start = v_period_start
  ) into v_period_exists;

  raise notice '[get_or_create_action_period] Period exists: %', v_period_exists;

  -- Create period row if it doesn't exist
  if not v_period_exists then
    -- Read quota from subscription_plans
    select sp.actions_per_month into v_quota
    from public.accounts a
    join public.subscription_plans sp on sp.id = a.plan_type
    where a.id = p_account_id;

    -- Fallback safety net
    if v_quota is null then
      v_quota := 1000;
    end if;

    raise notice '[get_or_create_action_period] Creating period with quota: %', v_quota;

    insert into public.account_action_periods
      (account_id, period_start, period_end, quota_units)
    values
      (p_account_id, v_period_start, v_period_end, v_quota)
    -- FIX: reference the constraint by name instead of column list.
    -- Using ON CONFLICT (account_id, period_start) is ambiguous here because
    -- period_start is also an OUT parameter of this function. Using the
    -- constraint name avoids any column-name lookup entirely.
    on conflict on constraint account_action_periods_pkey do nothing;

    raise notice '[get_or_create_action_period] ✓ Period created';
  end if;

  -- Return period data
  return query
  select
    aap.period_start,
    aap.period_end,
    aap.quota_units,
    aap.used_units,
    aap.extra_credits,
    aap.locked_editing,
    aap.paused_execution,
    aap.carryover_debt_units
  from public.account_action_periods aap
  where aap.account_id = p_account_id
    and aap.period_start = v_period_start;
end;
$$;

-- Restore EXECUTE grant (dropped along with the function)
grant execute on function public.get_or_create_action_period(uuid, timestamptz) to authenticated;

do $$ begin
  raise notice '✅ Fixed get_or_create_action_period:';
  raise notice '   - ON CONFLICT now uses constraint name (no column-name ambiguity)';
  raise notice '   - SECURITY DEFINER restored (bypasses RLS for INSERT)';
  raise notice '   - set search_path = public restored';
  raise notice '   - EXECUTE granted to authenticated role';
end $$;
