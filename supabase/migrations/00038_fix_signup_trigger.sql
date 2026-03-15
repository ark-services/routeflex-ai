-- ============================================================================
-- Fix handle_new_user() trigger for accounts + account_memberships system
--
-- PROBLEM:
-- 1. Old trigger inserts 'owner' into account_memberships, but constraint only allows: 'admin', 'member', 'viewer'
-- 2. Old trigger doesn't create an account first
-- 3. Old trigger doesn't set companies.account_id, which is now NOT NULL
--
-- SOLUTION:
-- 1. Create an account first
-- 2. Create company with account_id
-- 3. Add user to account_memberships with role 'admin' (not 'owner')
-- 4. Still add to company_members with 'owner' for legacy compatibility
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_account_id uuid;
  new_company_id uuid;
  company_name text;
BEGIN
  -- Generate a company name from email
  company_name := split_part(NEW.email, '@', 1) || '''s Company';

  -- 1. Create an account for the new user
  INSERT INTO public.accounts (name, plan_type, max_seats, billing_anchor_day, onboarding_completed)
  VALUES (company_name, 'basic', 1, EXTRACT(day FROM now())::int, false)
  RETURNING id INTO new_account_id;

  RAISE NOTICE '[handle_new_user] Created account: %', new_account_id;

  -- 2. Add user to account_memberships as 'admin' (NOT 'owner' - constraint doesn't allow it)
  INSERT INTO public.account_memberships (account_id, user_id, role)
  VALUES (new_account_id, NEW.id, 'admin');

  RAISE NOTICE '[handle_new_user] Added user to account_memberships as admin';

  -- 3. Create a default company linked to the account
  INSERT INTO public.companies (name, account_id)
  VALUES (company_name, new_account_id)
  RETURNING id INTO new_company_id;

  RAISE NOTICE '[handle_new_user] Created company: % with account_id: %', new_company_id, new_account_id;

  -- 4. Add user to company_members as 'owner' (for legacy compatibility if table still used)
  -- Check if company_members table exists first
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'company_members') THEN
    INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (new_company_id, NEW.id, 'owner')
    ON CONFLICT (company_id, user_id) DO NOTHING;

    RAISE NOTICE '[handle_new_user] Added user to company_members as owner';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and re-raise
    RAISE WARNING '[handle_new_user] Error: %, Detail: %', SQLERRM, SQLSTATE;
    RAISE;
END;
$$;

-- Recreate the trigger (in case it was dropped or needs updating)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- SUCCESS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Fixed handle_new_user() trigger for signup';
  RAISE NOTICE '   ';
  RAISE NOTICE '   CHANGES:';
  RAISE NOTICE '   1. Creates account first';
  RAISE NOTICE '   2. Adds user to account_memberships with role = ''admin'' (NOT ''owner'')';
  RAISE NOTICE '   3. Creates company with account_id set';
  RAISE NOTICE '   4. Adds user to company_members with role = ''owner'' (if table exists)';
  RAISE NOTICE '   ';
  RAISE NOTICE '   NEW SIGNUP FLOW:';
  RAISE NOTICE '   auth.users → account → account_memberships (admin) → company → company_members (owner)';
END $$;
