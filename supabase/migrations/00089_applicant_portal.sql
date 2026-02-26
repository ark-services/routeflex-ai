-- ── Migration 00089: Applicant Status Portal ─────────────────────────────────
--
-- 1. Add portal_token to applicants — persistent magic-link UUID, one per applicant
-- 2. Add applicant-portal config to board_groups — visibility toggle + per-step note
-- 3. Register portal.send_link automation action type

-- ── 1. Applicant portal token ────────────────────────────────────────────────
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS portal_token uuid
    NOT NULL
    DEFAULT gen_random_uuid()
    UNIQUE;

-- Index for fast /status/[token] lookups
CREATE INDEX IF NOT EXISTS applicants_portal_token_idx
  ON public.applicants (portal_token);

-- ── 2. Board group portal visibility ─────────────────────────────────────────
-- All existing groups default to visible_to_applicants = true (show by default)
ALTER TABLE public.board_groups
  ADD COLUMN IF NOT EXISTS visible_to_applicants boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS applicant_note text;

-- ── 3. Automation action type ─────────────────────────────────────────────────
ALTER TABLE public.automation_actions
  DROP CONSTRAINT IF EXISTS automation_actions_type_check;

ALTER TABLE public.automation_actions
  ADD CONSTRAINT automation_actions_type_check CHECK (type IN (
    'move_group',
    'set_status',
    'change_status',
    'delete_item',
    'set_date',
    'set_number',
    'inc_dec',
    'webhook',
    'send_email',
    'send_slack',
    'email_gmail',
    'send_email_gmail',
    'twilio.send_sms',
    'twilio.make_call_say',
    'integration.set_field',
    'fadv.add_subject',
    'safety_trainer.submit',
    'lms.send_training_link',
    'portal.send_link'
  ));

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 00089 complete';
  RAISE NOTICE '   applicants.portal_token — persistent UUID for /status/[token] portal';
  RAISE NOTICE '   board_groups.visible_to_applicants — controls pipeline step visibility';
  RAISE NOTICE '   board_groups.applicant_note — optional note shown to applicants at each step';
  RAISE NOTICE '   automation_actions: added portal.send_link type';
END $$;
