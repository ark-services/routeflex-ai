-- Migration: 00101_fadv_approve_order_action_type
--
-- Extends automation_actions.type CHECK constraint to include 'fadv.approve_order'.

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
    'ai.score_resume'
  ));

DO $$
BEGIN
  RAISE NOTICE '  Added fadv.approve_order to automation_actions_type_check';
END $$;
