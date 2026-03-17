-- Help Center: categories, articles, tickets, messages, and Slack integration

-- ============================================================
-- 1. help_categories
-- ============================================================
CREATE TABLE help_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  title       text NOT NULL,
  description text,
  icon        text,               -- lucide icon name
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. help_articles
-- ============================================================
CREATE TABLE help_articles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  uuid NOT NULL REFERENCES help_categories(id) ON DELETE CASCADE,
  slug         text NOT NULL,
  title        text NOT NULL,
  summary      text,                -- short description for listing
  content      text NOT NULL,        -- markdown body
  tags         text[] DEFAULT '{}',
  sort_order   int NOT NULL DEFAULT 0,
  published    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug)
);

CREATE INDEX idx_help_articles_category ON help_articles(category_id);
CREATE INDEX idx_help_articles_published ON help_articles(published) WHERE published = true;
CREATE INDEX idx_help_articles_tags ON help_articles USING gin(tags);

-- ============================================================
-- 3. help_tickets
-- ============================================================
CREATE TYPE help_ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE help_ticket_priority AS ENUM ('low', 'medium', 'high');

CREATE TABLE help_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number   serial,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name            text NOT NULL,
  email           text NOT NULL,
  subject         text NOT NULL,
  description     text NOT NULL,
  status          help_ticket_status NOT NULL DEFAULT 'open',
  priority        help_ticket_priority NOT NULL DEFAULT 'medium',
  slack_channel   text,           -- Slack channel ID where ticket was posted
  slack_ts        text,           -- Slack message timestamp for threading
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX idx_help_tickets_status ON help_tickets(status);
CREATE INDEX idx_help_tickets_email ON help_tickets(email);

-- ============================================================
-- 4. help_ticket_messages
-- ============================================================
CREATE TABLE help_ticket_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES help_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('user', 'admin', 'system')),
  sender_name text,
  body        text NOT NULL,
  slack_ts    text,               -- Slack message ts if posted via Slack
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_help_ticket_messages_ticket ON help_ticket_messages(ticket_id);

-- ============================================================
-- 5. help_slack_integration
-- ============================================================
CREATE TABLE help_slack_integration (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         text NOT NULL UNIQUE,       -- Slack workspace ID
  team_name       text,
  access_token    text NOT NULL,              -- bot token (encrypted at rest)
  channel_id      text NOT NULL,              -- channel to post tickets
  channel_name    text,
  bot_user_id     text,
  installed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. RLS policies — public read for articles/categories,
--    authenticated insert for tickets, service role for admin ops
-- ============================================================
ALTER TABLE help_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_slack_integration ENABLE ROW LEVEL SECURITY;

-- Categories: public read
CREATE POLICY "Anyone can read help categories"
  ON help_categories FOR SELECT
  USING (true);

-- Articles: public read for published
CREATE POLICY "Anyone can read published help articles"
  ON help_articles FOR SELECT
  USING (published = true);

-- Tickets: anyone can insert (guest or authenticated)
CREATE POLICY "Anyone can create help tickets"
  ON help_tickets FOR INSERT
  WITH CHECK (true);

-- Tickets: users can read their own by email
CREATE POLICY "Users can read their own tickets"
  ON help_tickets FOR SELECT
  USING (
    user_id = auth.uid()
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Messages: users can read messages for their tickets
CREATE POLICY "Users can read messages for their tickets"
  ON help_ticket_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM help_tickets t
      WHERE t.id = ticket_id
      AND (t.user_id = auth.uid() OR t.email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    )
  );

-- Messages: anyone can insert (for guest ticket replies)
CREATE POLICY "Anyone can add messages to tickets"
  ON help_ticket_messages FOR INSERT
  WITH CHECK (true);

-- Slack integration: only service role (no user access)
-- No policies needed — service role bypasses RLS

-- ============================================================
-- 7. Updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION help_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_help_categories_updated_at
  BEFORE UPDATE ON help_categories
  FOR EACH ROW EXECUTE FUNCTION help_set_updated_at();

CREATE TRIGGER trg_help_articles_updated_at
  BEFORE UPDATE ON help_articles
  FOR EACH ROW EXECUTE FUNCTION help_set_updated_at();

CREATE TRIGGER trg_help_tickets_updated_at
  BEFORE UPDATE ON help_tickets
  FOR EACH ROW EXECUTE FUNCTION help_set_updated_at();

CREATE TRIGGER trg_help_slack_integration_updated_at
  BEFORE UPDATE ON help_slack_integration
  FOR EACH ROW EXECUTE FUNCTION help_set_updated_at();
