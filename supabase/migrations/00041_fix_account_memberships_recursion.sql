-- Enable RLS
ALTER TABLE public.account_memberships ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'account_memberships'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.account_memberships', pol.policyname);
    END LOOP;
END $$;

-- Create single safe SELECT policy
CREATE POLICY "account_memberships_select_own"
  ON public.account_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
