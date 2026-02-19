-- Migration: 00061_twilio_automation_actions
-- Add Twilio action types to the automation_actions.type check constraint.

alter table public.automation_actions
  drop constraint if exists automation_actions_type_check;

alter table public.automation_actions
  add constraint automation_actions_type_check
  check (type in (
    -- Board / item actions
    'move_group',
    'set_status',
    'change_status',
    'delete_item',
    'set_date',
    'set_number',
    'inc_dec',
    -- Notification / webhook actions
    'webhook',
    'send_email',
    'send_slack',
    -- Gmail actions
    'email_gmail',
    'send_email_gmail',
    -- Twilio actions
    'twilio.send_sms',
    'twilio.make_call_say'
  ));
