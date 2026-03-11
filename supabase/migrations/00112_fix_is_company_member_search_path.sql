-- Migration 00112: Fix search_path on is_company_member and is_company_admin
--
-- These two functions were last defined in 00054 with SET search_path = ''
-- (empty string). Supabase's security linter flags empty search_path as
-- mutable. Changing to SET search_path = public resolves the warning.
-- Function bodies already use fully-qualified public.* names so behaviour
-- is unchanged.

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.companies            c
    JOIN   public.account_memberships  am ON am.account_id = c.account_id
    WHERE  c.id       = p_company_id
      AND  am.user_id = auth.uid()
  );
$$;

ALTER FUNCTION public.is_company_member(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated, anon;


CREATE OR REPLACE FUNCTION public.is_company_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.companies            c
    JOIN   public.account_memberships  am ON am.account_id = c.account_id
    WHERE  c.id       = p_company_id
      AND  am.user_id = auth.uid()
      AND  am.role   IN ('owner', 'admin')
  );
$$;

ALTER FUNCTION public.is_company_admin(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_company_admin(uuid) TO authenticated, anon;
