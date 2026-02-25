-- Migration: 00081_lms_automation_wiring
--
-- 1. Extends the automation_actions.type CHECK constraint to include
--    'lms.send_training_link' (action: enroll applicant + send magic-link email).
--
-- 2. Seeds a new automation trigger 'lms.course_completed' into
--    automation_triggers so companies can set up: "When LMS course completed
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
    'safety_trainer.submit',
    'lms.send_training_link'
  ));

-- ── 2. Seed the lms.course_completed trigger ──────────────────────────────────

INSERT INTO public.automation_triggers (key, name, description, payload_schema)
VALUES (
  'lms.course_completed',
  'LMS Course Completed',
  'When a learner passes the final exam and completes the training course',
  '{"company_id":"uuid","job_id":"uuid","applicant_id":"uuid","course_id":"uuid","enrollment_id":"uuid"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE '✅ Added lms.send_training_link to automation_actions_type_check';
  RAISE NOTICE '✅ Seeded lms.course_completed automation trigger';
END $$;
