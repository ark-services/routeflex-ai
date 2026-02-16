-- ============================================================================
-- Fix "column reference period_start is ambiguous" in ON CONFLICT clause
--
-- PROBLEM:
-- The ON CONFLICT (account_id, period_start) clause causes ambiguity because
-- period_start exists as:
-- 1. A table column in account_action_periods
-- 2. A return column in the function signature
--
-- SOLUTION:
-- Use ON CONFLICT ON CONSTRAINT with the explicit constraint name instead
-- ============================================================================

-- First, verify the constraint name exists
-- The primary key was defined as: primary key (account_id, period_start)
-- PostgreSQL auto-names this as: account_action_periods_pkey

-- If for some reason it has a different name, we'll create a named constraint
DO $$
BEGIN
  -- Check if primary key constraint exists
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'account_action_periods_pkey'
      AND conrelid = 'public.account_action_periods'::regclass
  ) THEN
    -- If not, add a named unique constraint
    ALTER TABLE public.account_action_periods
    DROP CONSTRAINT IF EXISTS account_action_periods_pkey CASCADE;

    ALTER TABLE public.account_action_periods
    ADD CONSTRAINT account_action_periods_pkey PRIMARY KEY (account_id, period_start);

    RAISE NOTICE 'Created primary key constraint: account_action_periods_pkey';
  END IF;
END $$;

-- ============================================================================
-- Fix get_or_create_action_period - use ON CONFLICT ON CONSTRAINT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_action_period(
  p_account_id uuid,
  p_at_date timestamptz DEFAULT now()
)
RETURNS TABLE(
  period_start timestamptz,
  period_end timestamptz,
  quota_units int,
  used_units int,
  locked_editing boolean,
  paused_execution boolean,
  carryover_debt_units int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_quota int;
  v_plan_type text;
  v_period_exists boolean;
BEGIN
  -- Get billing period (monthly)
  SELECT bp.period_start, bp.period_end INTO v_period_start, v_period_end
  FROM public.get_billing_period(p_account_id, p_at_date) bp;

  RAISE NOTICE '[get_or_create_action_period] Period: % to %', v_period_start, v_period_end;

  -- Check if period row exists (use qualified column names)
  SELECT EXISTS(
    SELECT 1
    FROM public.account_action_periods aap
    WHERE aap.account_id = p_account_id
      AND aap.period_start = v_period_start
  ) INTO v_period_exists;

  RAISE NOTICE '[get_or_create_action_period] Period exists: %', v_period_exists;

  -- Create period row if doesn't exist
  IF NOT v_period_exists THEN
    SELECT plan_type INTO v_plan_type FROM public.accounts WHERE id = p_account_id;
    v_quota := CASE v_plan_type
      WHEN 'basic' THEN 3000
      WHEN 'pro' THEN 10000
      ELSE 50000
    END;

    RAISE NOTICE '[get_or_create_action_period] Creating period with quota: %', v_quota;

    -- Use ON CONFLICT ON CONSTRAINT to avoid ambiguity
    INSERT INTO public.account_action_periods (account_id, period_start, period_end, quota_units)
    VALUES (p_account_id, v_period_start, v_period_end, v_quota)
    ON CONFLICT ON CONSTRAINT account_action_periods_pkey DO NOTHING;

    RAISE NOTICE '[get_or_create_action_period] ✓ Period created';
  END IF;

  -- Return period data (use fully qualified column names from table)
  RETURN QUERY
  SELECT
    aap.period_start,
    aap.period_end,
    aap.quota_units,
    aap.used_units,
    aap.locked_editing,
    aap.paused_execution,
    aap.carryover_debt_units
  FROM public.account_action_periods aap
  WHERE aap.account_id = p_account_id
    AND aap.period_start = v_period_start;
END;
$$;

-- ============================================================================
-- Grant execute permission
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_or_create_action_period(uuid, timestamptz) TO authenticated;

-- ============================================================================
-- SUCCESS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Fixed ON CONFLICT ambiguity in get_or_create_action_period';
  RAISE NOTICE '   ';
  RAISE NOTICE '   CHANGE:';
  RAISE NOTICE '   - Changed: ON CONFLICT (account_id, period_start)';
  RAISE NOTICE '   - To: ON CONFLICT ON CONSTRAINT account_action_periods_pkey';
  RAISE NOTICE '   ';
  RAISE NOTICE '   WHY:';
  RAISE NOTICE '   - period_start is both a table column AND a function return column';
  RAISE NOTICE '   - Column names in ON CONFLICT cause ambiguity';
  RAISE NOTICE '   - Using explicit constraint name removes ambiguity';
END $$;
