-- =============================================================================
-- Migration 00071: Add integration.set_field and fadv.add_subject to
--                  automation_actions.type check constraint
-- =============================================================================
--
-- Two action types were implemented in code but never added to the DB constraint:
--
--   integration.set_field  — sets a per-applicant FADV field value
--                            (added in app code, missing from 00061 constraint)
--
--   fadv.add_subject       — enqueues a background FADV submission
--                            (new action added in migration 00070)
--
-- Pattern: drop the named constraint and recreate it with the full list.
-- This is idempotent — safe to re-run on a DB that already has the new types
-- because the DROP uses IF EXISTS.
-- =============================================================================

alter table public.automation_actions
  drop constraint if exists automation_actions_type_check;

alter table public.automation_actions
  add constraint automation_actions_type_check
  check (type in (
    -- ── Board / item actions ──────────────────────────────────────────────
    'move_group',
    'set_status',
    'change_status',
    'delete_item',
    'set_date',
    'set_number',
    'inc_dec',
    -- ── Notification / webhook actions ───────────────────────────────────
    'webhook',
    'send_email',
    'send_slack',
    -- ── Gmail actions ─────────────────────────────────────────────────────
    'email_gmail',
    'send_email_gmail',
    -- ── Twilio actions ────────────────────────────────────────────────────
    'twilio.send_sms',
    'twilio.make_call_say',
    -- ── Integration / FADV actions ────────────────────────────────────────
    'integration.set_field',
    'fadv.add_subject'
  ));


-- ── SUCCESS ───────────────────────────────────────────────────────────────────

do $$
begin
  raise notice '✅ automation_actions_type_check updated';
  raise notice '   added: integration.set_field, fadv.add_subject';
  raise notice '   total allowed types: 16';
end $$;
