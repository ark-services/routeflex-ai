/**
 * Canonical list of all allowed automation_actions.type values.
 *
 * KEEP THIS IN SYNC WITH the DB check constraint in:
 *   supabase/migrations/00073_safety_trainer_action_type.sql
 *
 * HOW TO ADD A NEW ACTION TYPE:
 *   1. Add the string to AUTOMATION_ACTION_TYPES below.
 *   2. Create a new migration that drops and recreates
 *      automation_actions_type_check with the updated list.
 *   3. Add the executor case in src/lib/automations/fireJobAutomation.ts.
 *   4. Add the UI entry in src/components/automations/CreateTab.tsx.
 *   5. Add a label entry in src/components/automations/ManageTab.tsx.
 */

export const AUTOMATION_ACTION_TYPES = [
  // ── Board / item actions ────────────────────────────────────────────────────
  "move_group",
  "set_status",
  "change_status",
  "delete_item",
  "set_date",
  "set_number",
  "inc_dec",
  // ── Notification / webhook actions ─────────────────────────────────────────
  "webhook",
  "send_email",
  "send_slack",
  // ── Gmail actions ───────────────────────────────────────────────────────────
  "email_gmail",
  "send_email_gmail",
  // ── Twilio actions ──────────────────────────────────────────────────────────
  "twilio.send_sms",
  "twilio.make_call_say",
  // ── Integration / FADV actions ──────────────────────────────────────────────
  "integration.set_field",
  "fadv.add_subject",
  // ── Safety Trainer Hub ──────────────────────────────────────────────────────
  "safety_trainer.submit",
  // ── LMS (Learning Management System) ───────────────────────────────────────
  "lms.send_training_link",
] as const;

/** TypeScript union of every allowed action type string. */
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

/** Runtime guard — throws if `type` is not in the canonical list. */
export function assertValidActionType(type: string): asserts type is AutomationActionType {
  if (!(AUTOMATION_ACTION_TYPES as readonly string[]).includes(type)) {
    throw new Error(
      `Unknown automation action type: "${type}". ` +
        `Add it to AUTOMATION_ACTION_TYPES in src/lib/automations/actionTypes.ts ` +
        `and create a matching DB migration.`
    );
  }
}

/** Returns true if `type` is a known action type (non-throwing). */
export function isValidActionType(type: string): type is AutomationActionType {
  return (AUTOMATION_ACTION_TYPES as readonly string[]).includes(type);
}
