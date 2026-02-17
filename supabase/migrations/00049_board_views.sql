-- Migration: board_views
-- Adds a table to persist saved search/filter views per board (Monday-style).

CREATE TABLE IF NOT EXISTS board_views (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id      uuid        REFERENCES jobs(id) ON DELETE CASCADE,
  board_id    uuid        REFERENCES boards(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  -- query stores { search: string, filters: [...], logic: "and" }
  query       jsonb       NOT NULL DEFAULT '{"search":"","filters":[],"logic":"and"}'::jsonb,
  sort        jsonb,
  position    int         NOT NULL DEFAULT 0,
  is_default  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE board_views ENABLE ROW LEVEL SECURITY;

-- RLS: match existing pattern – members of the company can access
CREATE POLICY "board_views_select" ON board_views
  FOR SELECT USING (
    company_id IN (
      SELECT c.id FROM companies c
      INNER JOIN account_memberships am ON am.account_id = c.account_id
      WHERE am.user_id = auth.uid()
    )
  );

CREATE POLICY "board_views_insert" ON board_views
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT c.id FROM companies c
      INNER JOIN account_memberships am ON am.account_id = c.account_id
      WHERE am.user_id = auth.uid()
    )
  );

CREATE POLICY "board_views_update" ON board_views
  FOR UPDATE USING (
    company_id IN (
      SELECT c.id FROM companies c
      INNER JOIN account_memberships am ON am.account_id = c.account_id
      WHERE am.user_id = auth.uid()
    )
  );

CREATE POLICY "board_views_delete" ON board_views
  FOR DELETE USING (
    company_id IN (
      SELECT c.id FROM companies c
      INNER JOIN account_memberships am ON am.account_id = c.account_id
      WHERE am.user_id = auth.uid()
    )
  );

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_board_views_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER board_views_updated_at
  BEFORE UPDATE ON board_views
  FOR EACH ROW
  EXECUTE FUNCTION update_board_views_updated_at();
