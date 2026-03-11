-- Waitlist signups for "coming soon" landing page.

CREATE TABLE IF NOT EXISTS waitlist_signups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT  waitlist_signups_email_unique UNIQUE (email)
);

-- RLS enabled with no policies = anon/authenticated cannot access.
-- All access goes through service role client in server actions.
ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;
