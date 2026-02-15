import { SupabaseClient } from '@supabase/supabase-js';

export interface FireTriggerInput {
  companyId: string;
  trigger_key: string;
  subject_type: string;
  subject_id: string;
  payload: Record<string, any>;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Fires a trigger and executes all matching automations.
 * This is the single source of truth for automation execution.
 *
 * Execution flow:
 * 1. Find enabled automations for company + trigger_key
 * 2. Apply filter matching
 * 3. Execute actions in sort_order
 * 4. Log automation_runs
 * 5. Stop on first action failure
 */
export async function fireTrigger(
  supabase: SupabaseClient,
  input: FireTriggerInput
): Promise<void> {
  const { companyId, trigger_key, subject_type, subject_id, payload } = input;

  try {
    // Find enabled automations for this trigger
    const { data: automations, error: fetchError } = await supabase
      .from('automations')
      .select(`
        id,
        name,
        filter,
        automation_actions (
          id,
          type,
          config,
          sort_order
        )
      `)
      .eq('company_id', companyId)
      .eq('trigger_key', trigger_key)
      .eq('is_enabled', true)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('[fireTrigger] Failed to fetch automations:', fetchError);
      return;
    }

    if (!automations || automations.length === 0) {
      return; // No automations configured
    }

    // Execute each matching automation
    for (const automation of automations) {
      // Apply filter matching
      if (!matchesFilter(automation.filter, payload)) {
        // Log as skipped
        await supabase.from('automation_runs').insert({
          company_id: companyId,
          automation_id: automation.id,
          trigger_key,
          subject_type,
          subject_id,
          payload,
          status: 'skipped',
        });
        continue;
      }

      // Execute actions in sort_order
      const actions = (automation.automation_actions || []).sort(
        (a: any, b: any) => a.sort_order - b.sort_order
      );

      let runStatus: 'success' | 'failed' = 'success';
      let runError: string | undefined;

      for (const action of actions) {
        try {
          const result = await executeAction(supabase, companyId, action, payload);
          if (!result.success) {
            runStatus = 'failed';
            runError = result.error || 'Action execution failed';
            break; // Stop on first failure
          }
        } catch (err: any) {
          runStatus = 'failed';
          runError = err.message || 'Unexpected error during action execution';
          break;
        }
      }

      // Log automation run
      await supabase.from('automation_runs').insert({
        company_id: companyId,
        automation_id: automation.id,
        trigger_key,
        subject_type,
        subject_id,
        payload,
        status: runStatus,
        error: runError,
      });
    }
  } catch (err) {
    console.error('[fireTrigger] Unexpected error:', err);
  }
}

/**
 * Matches automation filter against event payload.
 * All keys in filter must match corresponding values in payload.
 */
function matchesFilter(filter: any, payload: Record<string, any>): boolean {
  if (!filter || typeof filter !== 'object') {
    return true; // No filter = match all
  }

  for (const [key, value] of Object.entries(filter)) {
    if (payload[key] !== value) {
      return false;
    }
  }

  return true;
}

/**
 * Executes a single action.
 */
async function executeAction(
  supabase: SupabaseClient,
  companyId: string,
  action: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { type, config } = action;

  switch (type) {
    case 'move_group':
      return executeMoveGroup(supabase, companyId, config, payload);

    case 'set_status':
      return executeSetStatus(supabase, companyId, config, payload);

    case 'webhook':
      return executeWebhook(supabase, companyId, config, payload);

    case 'send_email':
      return executeSendEmail(supabase, companyId, config, payload);

    default:
      return { success: false, error: `Unknown action type: ${type}` };
  }
}

/**
 * Action: move_group
 * Config: { to_group_id: uuid }
 */
async function executeMoveGroup(
  supabase: SupabaseClient,
  companyId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { to_group_id } = config;
  const applicantId = payload.applicant_id || payload.subject_id;

  if (!to_group_id) {
    return { success: false, error: 'Missing to_group_id in config' };
  }

  if (!applicantId) {
    return { success: false, error: 'Missing applicant_id in payload' };
  }

  const { error } = await supabase
    .from('applicants')
    .update({ group_id: to_group_id })
    .eq('id', applicantId)
    .eq('company_id', companyId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Action: set_status
 * Config: { status: text }
 */
async function executeSetStatus(
  supabase: SupabaseClient,
  companyId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { status } = config;
  const applicantId = payload.applicant_id || payload.subject_id;

  if (!status) {
    return { success: false, error: 'Missing status in config' };
  }

  if (!applicantId) {
    return { success: false, error: 'Missing applicant_id in payload' };
  }

  const { error } = await supabase
    .from('applicants')
    .update({ status })
    .eq('id', applicantId)
    .eq('company_id', companyId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Action: webhook
 * Config: { url: text, method?: 'POST', headers?: object }
 */
async function executeWebhook(
  supabase: SupabaseClient,
  companyId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { url, method = 'POST', headers = {} } = config;

  if (!url) {
    return { success: false, error: 'Missing url in config' };
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Webhook failed with status ${response.status}`
      };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Action: send_email
 * Config: { to_email?: string, subject: string, body: string }
 *
 * NOTE: This is a stub. In production, integrate with SendGrid/Resend/etc.
 * For now, we just log the email preview to the automation run.
 */
async function executeSendEmail(
  supabase: SupabaseClient,
  companyId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { to_email, subject, body } = config;

  // In a real implementation, you would:
  // 1. Resolve to_email from payload if not provided
  // 2. Send via email service (SendGrid, Resend, etc.)
  // 3. Log the email send

  // For now, just return success with a preview
  console.log('[send_email] Email preview:', {
    to: to_email || 'auto-resolved',
    subject,
    body,
    payload,
  });

  return { success: true };
}
