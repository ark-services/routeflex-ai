-- Drop all existing policies on account_memberships
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.account_memberships;
DROP POLICY IF EXISTS "Users can insert their own memberships" ON public.account_memberships;
DROP POLICY IF EXISTS "Users can delete their own memberships" ON public.account_memberships;
DROP POLICY IF EXISTS "Users can update their own memberships" ON public.account_memberships;
DROP POLICY IF EXISTS "Account members can view memberships" ON public.account_memberships;
DROP POLICY IF EXISTS "Account members can manage memberships" ON public.account_memberships;
DROP POLICY IF EXISTS "Enable read access for account members" ON public.account_memberships;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.account_memberships;
DROP POLICY IF EXISTS "Enable delete for account members" ON public.account_memberships;
DROP POLICY IF EXISTS "Enable update for account members" ON public.account_memberships;

-- Create simple policies without self-referencing logic

-- SELECT: Allow select where user_id = auth.uid()
CREATE POLICY "Allow users to view their own membership"
  ON public.account_memberships
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: Allow insert where user_id = auth.uid()
CREATE POLICY "Allow users to insert their own membership"
  ON public.account_memberships
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- DELETE: Allow delete where user_id = auth.uid()
CREATE POLICY "Allow users to delete their own membership"
  ON public.account_memberships
  FOR DELETE
  USING (user_id = auth.uid());

-- UPDATE: Allow update where user_id = auth.uid()
CREATE POLICY "Allow users to update their own membership"
  ON public.account_memberships
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
