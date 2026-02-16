-- Enable RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies on jobs
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'jobs'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.jobs', pol.policyname);
    END LOOP;
END $$;

-- Create policies scoped by company_id

-- SELECT: Users can view jobs for companies they belong to
CREATE POLICY "jobs_select_by_company"
  ON public.jobs
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      INNER JOIN public.account_memberships am ON c.account_id = am.account_id
      WHERE am.user_id = auth.uid()
    )
  );

-- INSERT: Users can create jobs for companies they belong to
CREATE POLICY "jobs_insert_by_company"
  ON public.jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      INNER JOIN public.account_memberships am ON c.account_id = am.account_id
      WHERE am.user_id = auth.uid()
    )
  );

-- UPDATE: Users can update jobs for companies they belong to
CREATE POLICY "jobs_update_by_company"
  ON public.jobs
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      INNER JOIN public.account_memberships am ON c.account_id = am.account_id
      WHERE am.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      INNER JOIN public.account_memberships am ON c.account_id = am.account_id
      WHERE am.user_id = auth.uid()
    )
  );

-- DELETE: Users can delete jobs for companies they belong to
CREATE POLICY "jobs_delete_by_company"
  ON public.jobs
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT c.id
      FROM public.companies c
      INNER JOIN public.account_memberships am ON c.account_id = am.account_id
      WHERE am.user_id = auth.uid()
    )
  );
