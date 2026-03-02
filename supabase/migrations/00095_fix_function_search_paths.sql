-- ============================================================
-- Migration 00095: Pin search_path = public on all functions
-- that were flagged by the security linter as
-- "function_search_path_mutable".
--
-- Without an explicit SET search_path, a privileged function
-- could be exploited by an attacker who creates objects in a
-- non-public schema to shadow built-in functions or operators.
-- Adding SET search_path = public eliminates this attack vector.
-- ============================================================

-- 1. disable_automations_for_deleted_column
CREATE OR REPLACE FUNCTION public.disable_automations_for_deleted_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count int;
BEGIN
  UPDATE public.automations
  SET
    is_enabled = false,
    updated_at = now()
  WHERE
    company_id = OLD.company_id
    AND (
      (filter->>'column_id' = OLD.id::text)
      OR
      id IN (
        SELECT aa.automation_id
        FROM public.automation_actions aa
        WHERE aa.automation_id = automations.id
          AND (aa.config->>'column_id' = OLD.id::text)
      )
    );

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'Disabled % automation(s) referencing deleted column: %', affected_count, OLD.name;
  RETURN OLD;
END;
$$;

-- 2. can_create_job
CREATE OR REPLACE FUNCTION public.can_create_job(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_max        int;
  v_current    int;
BEGIN
  SELECT account_id INTO v_account_id
  FROM public.companies WHERE id = p_company_id;

  IF v_account_id IS NULL THEN RETURN false; END IF;

  SELECT sp.max_jobs_per_company INTO v_max
  FROM public.accounts a
  JOIN public.subscription_plans sp ON sp.id = a.plan_type
  WHERE a.id = v_account_id;

  IF v_max IS NULL THEN RETURN false; END IF;
  IF v_max = -1   THEN RETURN true;  END IF;

  SELECT count(*) INTO v_current
  FROM public.jobs
  WHERE company_id = p_company_id;

  RETURN v_current < v_max;
END;
$$;

-- 3. can_add_member
CREATE OR REPLACE FUNCTION public.can_add_member(p_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max     int;
  v_current int;
BEGIN
  SELECT sp.max_seats INTO v_max
  FROM public.accounts a
  JOIN public.subscription_plans sp ON sp.id = a.plan_type
  WHERE a.id = p_account_id;

  IF v_max IS NULL THEN RETURN false; END IF;
  IF v_max = -1   THEN RETURN true;  END IF;

  SELECT count(*) INTO v_current
  FROM public.account_memberships
  WHERE account_id = p_account_id;

  RETURN v_current < v_max;
END;
$$;

-- 4. job_belongs_to_company
CREATE OR REPLACE FUNCTION public.job_belongs_to_company(p_job_id uuid, p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.jobs
    WHERE id = p_job_id
      AND company_id = p_company_id
  );
END;
$$;

-- 5. can_access_job
CREATE OR REPLACE FUNCTION public.can_access_job(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.jobs j
    INNER JOIN public.companies c ON c.id = j.company_id
    INNER JOIN public.account_memberships am ON am.account_id = c.account_id
    WHERE j.id = p_job_id
      AND am.user_id = auth.uid()
  );
END;
$$;

-- 6. validate_automation_job_company  (trigger — no SECURITY DEFINER needed)
CREATE OR REPLACE FUNCTION public.validate_automation_job_company()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.job_belongs_to_company(NEW.job_id, NEW.company_id) THEN
    RAISE EXCEPTION 'job_id % does not belong to company_id %', NEW.job_id, NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 7. disable_automations_for_deleted_label
CREATE OR REPLACE FUNCTION public.disable_automations_for_deleted_label()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count int;
BEGIN
  UPDATE public.automations
  SET
    is_enabled = false,
    updated_at = now()
  WHERE
    company_id = (
      SELECT c.company_id
      FROM public.board_columns c
      WHERE c.id = OLD.column_id
    )
    AND (
      (filter->>'changes_to' = OLD.id::text)
      OR
      id IN (
        SELECT aa.automation_id
        FROM public.automation_actions aa
        WHERE aa.automation_id = automations.id
          AND (
            (aa.type = 'change_status' AND aa.config->>'target_label' = OLD.id::text)
            OR
            (aa.type = 'set_status'    AND aa.config->>'status_label_id' = OLD.id::text)
          )
      )
    );

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'Disabled % automation(s) referencing deleted status label: %', affected_count, OLD.label;
  RETURN OLD;
END;
$$;

-- 8. update_updated_at_column  (generic trigger — no SECURITY DEFINER needed)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 9. get_status_label_text
CREATE OR REPLACE FUNCTION public.get_status_label_text(p_label_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
BEGIN
  SELECT label INTO v_label
  FROM public.board_status_labels
  WHERE id = p_label_id;

  RETURN v_label;
END;
$$;

-- 10. get_column_name
CREATE OR REPLACE FUNCTION public.get_column_name(p_column_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT name INTO v_name
  FROM public.board_columns
  WHERE id = p_column_id;

  RETURN v_name;
END;
$$;

-- 11. update_board_views_updated_at
CREATE OR REPLACE FUNCTION public.update_board_views_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 12. set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 13. update_safety_trainer_connections_updated_at
CREATE OR REPLACE FUNCTION public.update_safety_trainer_connections_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 14. _lms_course_templates_set_updated_at
CREATE OR REPLACE FUNCTION public._lms_course_templates_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 15. _lms_courses_set_updated_at
CREATE OR REPLACE FUNCTION public._lms_courses_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 16. _lms_modules_set_updated_at
CREATE OR REPLACE FUNCTION public._lms_modules_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 17. on_account_plan_changed
CREATE OR REPLACE FUNCTION public.on_account_plan_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.subscription_plans%rowtype;
BEGIN
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = NEW.plan_type;

  NEW.max_seats := CASE WHEN v_plan.max_seats = -1 THEN 999999 ELSE v_plan.max_seats END;

  UPDATE public.companies
  SET lms_enabled = v_plan.lms_access
  WHERE account_id = NEW.id;

  RAISE NOTICE '[on_account_plan_changed] Account % → plan %, max_seats %, lms_access %',
    NEW.id, NEW.plan_type, NEW.max_seats, v_plan.lms_access;

  RETURN NEW;
END;
$$;

-- 18. get_account_plan_limits
CREATE OR REPLACE FUNCTION public.get_account_plan_limits(p_account_id uuid)
RETURNS TABLE(
  plan_id              text,
  plan_name            text,
  price_cents          int,
  max_seats            int,
  max_companies        int,
  max_jobs_per_company int,
  actions_per_month    int,
  template_access      boolean,
  lms_access           boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.id,
    sp.name,
    sp.price_cents,
    sp.max_seats,
    sp.max_companies,
    sp.max_jobs_per_company,
    sp.actions_per_month,
    sp.template_access,
    sp.lms_access
  FROM public.accounts a
  JOIN public.subscription_plans sp ON sp.id = a.plan_type
  WHERE a.id = p_account_id;
END;
$$;

-- 19. can_create_company
CREATE OR REPLACE FUNCTION public.can_create_company(p_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max     int;
  v_current int;
BEGIN
  SELECT sp.max_companies INTO v_max
  FROM public.accounts a
  JOIN public.subscription_plans sp ON sp.id = a.plan_type
  WHERE a.id = p_account_id;

  IF v_max IS NULL THEN RETURN false; END IF;
  IF v_max = -1   THEN RETURN true;  END IF;

  SELECT count(*) INTO v_current
  FROM public.companies
  WHERE account_id = p_account_id;

  RETURN v_current < v_max;
END;
$$;

-- 20. get_invite_link_info
CREATE OR REPLACE FUNCTION public.get_invite_link_info(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link record;
BEGIN
  SELECT
    l.account_id,
    l.role,
    l.expires_at,
    a.name AS account_name
  INTO v_link
  FROM public.account_invite_links l
  JOIN public.accounts a ON a.id = l.account_id
  WHERE l.token = p_token
    AND l.is_active = true
    AND l.expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid');
  END IF;

  RETURN jsonb_build_object(
    'account_id',   v_link.account_id,
    'account_name', v_link.account_name,
    'role',         v_link.role,
    'expires_at',   v_link.expires_at
  );
END;
$$;

-- 21. accept_invite_link
CREATE OR REPLACE FUNCTION public.accept_invite_link(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_link       record;
  v_already    boolean;
  v_seat_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  SELECT l.*, a.max_seats
  INTO   v_link
  FROM   public.account_invite_links l
  JOIN   public.accounts a ON a.id = l.account_id
  WHERE  l.token     = p_token
    AND  l.is_active = true
    AND  l.expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.account_memberships
    WHERE account_id = v_link.account_id AND user_id = v_user_id
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('already_member', true, 'account_id', v_link.account_id);
  END IF;

  SELECT count(*) INTO v_seat_count
  FROM public.account_memberships
  WHERE account_id = v_link.account_id;

  IF v_seat_count >= v_link.max_seats THEN
    RETURN jsonb_build_object('error', 'seat_limit');
  END IF;

  INSERT INTO public.account_memberships (account_id, user_id, role)
  VALUES (v_link.account_id, v_user_id, v_link.role);

  UPDATE public.account_invite_links
  SET use_count = use_count + 1
  WHERE id = v_link.id;

  RETURN jsonb_build_object('success', true, 'account_id', v_link.account_id);
END;
$$;
