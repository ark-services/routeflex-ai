-- Migration: 00073_safety_trainer_action_type
--
-- Extends the automation_actions.type CHECK constraint to include
-- 'safety_trainer.submit'.
--
-- The existing constraint (from 00071_automation_action_types_fadv.sql)
-- covers: move_group, set_status, change_status, delete_item, set_date,
-- set_number, inc_dec, webhook, send_email, send_slack, email_gmail,
-- send_email_gmail, twilio.send_sms, twilio.make_call_say,
-- integration.set_field, fadv.add_subject.

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
    'safety_trainer.submit'
  ));
