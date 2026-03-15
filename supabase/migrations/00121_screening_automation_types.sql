-- Migration: 00121_screening_automation_types
--
-- 1. Extends automation_actions.type CHECK constraint to include
--    'screening.send_link' (action: create submission + send magic-link email).
--
-- 2. Seeds a new automation trigger 'screening.completed' into
--    automation_triggers so companies can set up: "When screening completed
--    → move to stage X" automations.

-- ── 1. Extend the action type constraint ─────────────────────────────────────

ALTER TABLE automation_actions
  DROP CONSTRAINT IF EXISTS automation_actions_type_check;

ALTER TABLE automation_actions
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
    'fadv.approve_order',
    'safety_trainer.submit',
    'lms.send_training_link',
    'portal.send_link',
    'ai.score_resume',
    'esign.send_agreement',
    'screening.send_link'
  ));

-- ── 2. Seed the screening.completed trigger ───────────────────────────────────

INSERT INTO public.automation_triggers (key, name, description, payload_schema)
VALUES (
  'screening.completed',
  'Screening Completed',
  'When an applicant completes a screening questionnaire and AI scoring finishes',
  '{"company_id":"uuid","job_id":"uuid","applicant_id":"uuid","submission_id":"uuid","ai_score":"number","recommendation":"string"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE '✅ Added screening.send_link to automation_actions_type_check';
  RAISE NOTICE '✅ Seeded screening.completed automation trigger';
END $$;
