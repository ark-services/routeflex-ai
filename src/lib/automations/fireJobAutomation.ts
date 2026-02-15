import { SupabaseClient } from '@supabase/supabase-js';

export interface FireJobTriggerInput {
  companyId: string;
  jobId: string;
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
 * Fires a job-level trigger and executes all matching automations.
 * Single source of truth for automation execution.
 *
 * Execution flow:
 * 1. Find enabled automations for (companyId, jobId, trigger_key)
 * 2. Apply filter matching
 * 3. Execute actions in sort_order
 * 4. Log automation_runs
 * 5. Stop on first action failure
 */
export async function fireJobTrigger(
  supabase: SupabaseClient,
  input: FireJobTriggerInput
): Promise<void> {
  const { companyId, jobId, trigger_key, subject_type, subject_id, payload } = input;

  // Mark this trigger as automation-sourced to prevent infinite loops
  const isFromAutomation = payload.source === 'automation';

  try {
    // Find enabled automations for this job + trigger
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
      .eq('job_id', jobId)
      .eq('trigger_key', trigger_key)
      .eq('is_enabled', true)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('[fireJobTrigger] Failed to fetch automations:', fetchError);
      return;
    }

    if (!automations || automations.length === 0) {
      return; // No automations configured for this job
    }

    // Execute each matching automation
    for (const automation of automations) {
      // Skip automations triggered by other automations unless explicitly allowed
      // This prevents infinite loops (e.g., move_group triggering applicant.moved_group)
      if (isFromAutomation) {
        // For now, skip all automation-sourced triggers
        // Future: allow specific triggers to chain (via automation.allow_chaining)
        await supabase.from('automation_runs').insert({
          company_id: companyId,
          job_id: jobId,
          automation_id: automation.id,
          trigger_key,
          subject_type,
          subject_id,
          payload,
          status: 'skipped',
          error: 'Skipped: triggered by another automation',
        });
        continue;
      }

      // Apply filter matching
      if (!matchesFilter(automation.filter, payload)) {
        // Log as skipped
        await supabase.from('automation_runs').insert({
          company_id: companyId,
          job_id: jobId,
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
          const result = await executeAction(supabase, companyId, jobId, action, payload);
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
        job_id: jobId,
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
    console.error('[fireJobTrigger] Unexpected error:', err);
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

  // Empty filter object = match all
  if (Object.keys(filter).length === 0) {
    return true;
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
  jobId: string,
  action: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { type, config } = action;

  switch (type) {
    case 'move_group':
      return executeMoveGroup(supabase, companyId, jobId, config, payload);

    case 'set_status':
      return executeSetStatus(supabase, companyId, jobId, config, payload);

    case 'webhook':
      return executeWebhook(supabase, companyId, jobId, config, payload);

    case 'send_email':
      return executeSendEmail(supabase, companyId, jobId, config, payload);

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
  jobId: string,
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

  // Update with source marker to prevent infinite loops
  const { error } = await supabase
    .from('applicants')
    .update({ group_id: to_group_id })
    .eq('id', applicantId)
    .eq('company_id', companyId)
    .eq('job_id', jobId);

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
  jobId: string,
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
    .eq('company_id', companyId)
    .eq('job_id', jobId);

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
  jobId: string,
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
      body: JSON.stringify({
        ...payload,
        automation_metadata: {
          company_id: companyId,
          job_id: jobId,
        },
      }),
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
 * Config: { to?: 'applicant' | string, subject: string, body: string }
 *
 * NOTE: This is a stub. Logs email preview to console.
 * Ready for integration with SendGrid/Resend/etc.
 */
async function executeSendEmail(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { to, subject, body } = config;

  // Render template variables (basic string replacement)
  const renderTemplate = (template: string, data: Record<string, any>): string => {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  };

  const renderedSubject = renderTemplate(subject || '', payload);
  const renderedBody = renderTemplate(body || '', payload);

  // Get recipient email
  let recipientEmail = to;
  if (to === 'applicant' && payload.applicant_id) {
    const { data: applicant } = await supabase
      .from('applicants')
      .select('email')
      .eq('id', payload.applicant_id)
      .single();
    recipientEmail = applicant?.email;
  }

  // Log email preview (stub - replace with actual email service)
  console.log('[send_email] Email preview:', {
    to: recipientEmail,
    subject: renderedSubject,
    body: renderedBody,
    payload,
  });

  // In production, integrate with email service here:
  // await emailService.send({ to: recipientEmail, subject: renderedSubject, body: renderedBody });

  return { success: true };
}
