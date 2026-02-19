-- =============================================================================
-- Migration 00060: Company-scope Gmail connections
-- =============================================================================
--
-- Goals
-- ─────
-- 1. Add `company_id` to public.gmail_connections so connections are scoped
--    to a company (not just an account/user pair).
-- 2. Backfill company_id for all existing rows: pick the oldest company that
--    belongs to the same account_id.
-- 3. Add an index for efficient company-scoped lookups.
-- 4. Replace the per-user RLS policies with company-membership policies so
--    any admin can manage the company's Gmail connection.
--
-- MVP model: one ACTIVE Gmail connection per company (enforced by application
-- logic in the OAuth callback: revoke all active → upsert new).
-- The unique(account_id, user_id, email_address) constraint stays intact for
-- deduplication; it does not conflict with the new model.
-- =============================================================================


-- ── PART 1: add company_id column ────────────────────────────────────────────

ALTER TABLE public.gmail_connections
  ADD COLUMN IF NOT EXISTS company_id uuid
  REFERENCES public.companies(id) ON DELETE SET NULL;


-- ── PART 2: backfill existing rows ───────────────────────────────────────────
-- For each gmail_connections row, assign the oldest company that has the same
-- account_id.  Rows without a matching company are left NULL (no existing data
-- should hit this case after backfill).

UPDATE public.gmail_connections gc
SET    company_id = (
  SELECT c.id
  FROM   public.companies c
  WHERE  c.account_id = gc.account_id
  ORDER  BY c.created_at ASC
  LIMIT  1
)
WHERE gc.company_id IS NULL;


-- ── PART 3: index for company-scoped lookups (active connections only) ───────

CREATE INDEX IF NOT EXISTS gmail_connections_company_active_idx
  ON public.gmail_connections(company_id)
  WHERE revoked_at IS NULL;


-- ── PART 4: update RLS policies ──────────────────────────────────────────────
-- Replace the per-user policies (user_id = auth.uid()) with company-membership
-- policies so any account admin can manage the company Gmail connection.

-- Drop old per-user policies (idempotent)
DROP POLICY IF EXISTS "Users can view own gmail connections"   ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can create own gmail connections" ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can update own gmail connections" ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can delete own gmail connections" ON public.gmail_connections;

-- SELECT: any company member can read the connection metadata
CREATE POLICY "Company members can view Gmail connections"
  ON public.gmail_connections
  FOR SELECT
  USING (
    company_id IS NOT NULL
    AND public.is_company_member(company_id)
  );

-- INSERT: any company member can create a connection for their company
CREATE POLICY "Company members can insert Gmail connections"
  ON public.gmail_connections
  FOR INSERT
  WITH CHECK (
    company_id IS NOT NULL
    AND public.is_company_member(company_id)
  );

-- UPDATE: any company member can update/revoke connections for their company
-- (needed so the OAuth callback can revoke a previous user's connection)
CREATE POLICY "Company members can update Gmail connections"
  ON public.gmail_connections
  FOR UPDATE
  USING (
    company_id IS NOT NULL
    AND public.is_company_member(company_id)
  );

-- DELETE: any company member can hard-delete connections for their company
CREATE POLICY "Company members can delete Gmail connections"
  ON public.gmail_connections
  FOR DELETE
  USING (
    company_id IS NOT NULL
    AND public.is_company_member(company_id)
  );


-- ── PART 5: comments ─────────────────────────────────────────────────────────

COMMENT ON COLUMN public.gmail_connections.company_id IS
  'Company this Gmail connection belongs to. NULL only for legacy rows that '
  'could not be backfilled. MVP enforces one ACTIVE connection per company '
  '(revoke-then-upsert in the OAuth callback).';
