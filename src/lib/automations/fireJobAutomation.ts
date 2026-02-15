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
 * 2. Apply filter matching (exact match on all filter keys)
 * 3. Execute actions in sort_order
 * 4. Log automation_runs
 * 5. Stop on first action failure
 */
export async function fireJobTrigger(
  supabase: SupabaseClient,
  input: FireJobTriggerInput
): Promise<void> {
  const { companyId, jobId, trigger_key, subject_type, subject_id, payload } = input;

  console.log('[fireJobTrigger] ========================================');
  console.log('[fireJobTrigger] Trigger fired:', {
    trigger_key,
    companyId,
    jobId,
    subject_type,
    subject_id,
    payload,
  });

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

    console.log('[fireJobTrigger] Found automations:', automations?.length || 0);

    if (!automations || automations.length === 0) {
      console.log('[fireJobTrigger] No automations configured for this job + trigger');
      return; // No automations configured for this job
    }

    // Execute each matching automation
    for (const automation of automations) {
      console.log('[fireJobTrigger] Checking automation:', {
        id: automation.id,
        name: automation.name,
        filter: automation.filter,
      });

      // Skip automations triggered by other automations unless explicitly allowed
      // This prevents infinite loops (e.g., move_group triggering applicant.moved_group)
      if (isFromAutomation) {
        const skipReason = 'Triggered by another automation (infinite loop prevention)';
        console.log('[fireJobTrigger] Skipping automation:', skipReason);
        await supabase.from('automation_runs').insert({
          company_id: companyId,
          job_id: jobId,
          automation_id: automation.id,
          trigger_key,
          subject_type,
          subject_id,
          payload,
          status: 'skipped',
          error: skipReason,
          skip_reason: skipReason,
        });
        continue;
      }

      // Log filter evaluation predicates
      console.log('[fireJobTrigger] Evaluating filter predicates:', {
        automation_id: automation.id,
        automation_name: automation.name,
        is_enabled: true, // Already filtered by query
        trigger_key_match: true, // Already filtered by query
        filter: automation.filter,
        payload_column_id: payload.column_id,
        payload_new_value: payload.new_value,
        payload_new_label: payload.new_label,
        payload_old_value: payload.old_value,
        payload_old_label: payload.old_label,
      });

      // Apply filter matching
      const filterMatches = matchesFilter(automation.filter, payload);

      if (!filterMatches) {
        const skipReason = `Filter did not match. Filter: ${JSON.stringify(automation.filter)}, Payload: column_id=${payload.column_id}, new_value=${payload.new_value}, new_label="${payload.new_label}"`;
        console.log('[fireJobTrigger] SKIP:', skipReason);

        // Log as skipped with detailed reason
        await supabase.from('automation_runs').insert({
          company_id: companyId,
          job_id: jobId,
          automation_id: automation.id,
          trigger_key,
          subject_type,
          subject_id,
          payload,
          status: 'skipped',
          skip_reason: skipReason,
        });
        continue;
      }

      console.log('[fireJobTrigger] ✓ Filter matched! Executing actions...');

      // Execute actions in sort_order
      const actions = (automation.automation_actions || []).sort(
        (a: any, b: any) => a.sort_order - b.sort_order
      );

      let runStatus: 'success' | 'failed' = 'success';
      let runError: string | undefined;

      for (const action of actions) {
        console.log('[fireJobTrigger] Executing action:', {
          type: action.type,
          config: action.config,
        });

        try {
          const result = await executeAction(supabase, companyId, jobId, action, payload);
          console.log('[fireJobTrigger] Action result:', result);

          if (!result.success) {
            runStatus = 'failed';
            runError = result.error || 'Action execution failed';
            console.error('[fireJobTrigger] ✗ Action failed:', runError);
            break; // Stop on first failure
          }

          console.log('[fireJobTrigger] ✓ Action succeeded');
        } catch (err: any) {
          runStatus = 'failed';
          runError = err.message || 'Unexpected error during action execution';
          console.error('[fireJobTrigger] ✗ Action threw error:', err);
          break;
        }
      }

      console.log('[fireJobTrigger] Final run status:', runStatus);
      console.log('[fireJobTrigger] Actions executed:', actions.length);
      console.log('[fireJobTrigger] Run error:', runError || 'none');

      // Log automation run
      const { error: insertError } = await supabase.from('automation_runs').insert({
        company_id: companyId,
        job_id: jobId,
        automation_id: automation.id,
        trigger_key,
        subject_type,
        subject_id,
        payload,
        status: runStatus,
        error: runError,
        skip_reason: null, // Not skipped if we got here
      });

      if (insertError) {
        console.error('[fireJobTrigger] Failed to insert automation_run:', insertError);
      } else {
        console.log('[fireJobTrigger] ✓ Automation run logged successfully');
      }

      console.log('[fireJobTrigger] ========================================');
    }
  } catch (err) {
    console.error('[fireJobTrigger] Unexpected error:', err);
  }
}

/**
 * Matches automation filter against event payload.
 * All keys in filter must match corresponding values in payload (exact match).
 *
 * Special mappings:
 * - filter.column_id → payload.column_id (UUID)
 * - filter.changes_to → payload.new_value (UUID, NOT new_label)
 */
function matchesFilter(filter: any, payload: Record<string, any>): boolean {
  if (!filter || typeof filter !== 'object') {
    console.log('[matchesFilter] No filter or invalid filter object - match all');
    return true;
  }

  if (Object.keys(filter).length === 0) {
    console.log('[matchesFilter] Empty filter object - match all');
    return true;
  }

  console.log('[matchesFilter] Evaluating filter:', filter);
  console.log('[matchesFilter] Against payload:', payload);

  for (const [key, value] of Object.entries(filter)) {
    // Special handling for column_id match (for board.status_changes_to trigger)
    if (key === 'column_id') {
      const matches = payload.column_id === value;
      console.log(`[matchesFilter] column_id: filter=${value}, payload=${payload.column_id}, match=${matches}`);
      if (!matches) {
        return false;
      }
      continue; // Match succeeded, move to next filter key
    }

    // Special handling for changes_to match (maps to payload.new_value UUID, NOT new_label text)
    if (key === 'changes_to') {
      const matches = payload.new_value === value;
      console.log(`[matchesFilter] changes_to: filter=${value}, payload.new_value=${payload.new_value}, payload.new_label="${payload.new_label}", match=${matches}`);
      if (!matches) {
        return false;
      }
      continue; // Match succeeded, move to next filter key
    }

    // Generic key match for any other filter keys
    const matches = payload[key] === value;
    console.log(`[matchesFilter] ${key}: filter=${value}, payload=${payload[key]}, match=${matches}`);
    if (!matches) {
      return false;
    }
  }

  console.log('[matchesFilter] ✓ All filter conditions matched');
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

    case 'change_status':
      return executeChangeStatus(supabase, companyId, jobId, config, payload);

    case 'delete_item':
      return executeDeleteItem(supabase, companyId, jobId, config, payload);

    case 'set_date':
      return executeSetDate(supabase, companyId, jobId, config, payload);

    case 'set_number':
      return executeSetNumber(supabase, companyId, jobId, config, payload);

    case 'inc_dec':
      return executeIncDec(supabase, companyId, jobId, config, payload);

    case 'webhook':
      return executeWebhook(supabase, companyId, jobId, config, payload);

    case 'send_email':
      return executeSendEmail(supabase, companyId, jobId, config, payload);

    case 'send_slack':
      return executeSendSlack(supabase, companyId, jobId, config, payload);

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

  console.log('[executeMoveGroup] Starting:', {
    to_group_id,
    applicantId,
    companyId,
    jobId,
  });

  if (!to_group_id) {
    console.error('[executeMoveGroup] Missing to_group_id in config');
    return { success: false, error: 'Missing to_group_id in config' };
  }

  if (!applicantId) {
    console.error('[executeMoveGroup] Missing applicant_id in payload');
    return { success: false, error: 'Missing applicant_id in payload' };
  }

  // First, get the current group_id for logging
  const { data: currentApplicant, error: selectError } = await supabase
    .from('applicants')
    .select('group_id, full_name, company_id, job_id')
    .eq('id', applicantId)
    .maybeSingle();

  console.log('[executeMoveGroup] Current applicant:', {
    found: !!currentApplicant,
    applicant: currentApplicant,
    selectError: selectError?.message,
  });

  if (selectError) {
    console.error('[executeMoveGroup] Pre-move check failed:', selectError);
    return { success: false, error: `Pre-move check failed: ${selectError.message}` };
  }

  if (!currentApplicant) {
    console.error('[executeMoveGroup] Applicant not found or RLS blocking SELECT');
    return { success: false, error: 'Applicant not found or permission denied' };
  }

  // Verify target group exists
  const { data: targetGroup } = await supabase
    .from('board_groups')
    .select('id, name')
    .eq('id', to_group_id)
    .maybeSingle();

  console.log('[executeMoveGroup] Target group check:', {
    groupId: to_group_id,
    groupExists: !!targetGroup,
    groupName: targetGroup?.name,
  });

  if (!targetGroup) {
    console.error('[executeMoveGroup] Target group not found:', to_group_id);
    return { success: false, error: `Target group ${to_group_id} not found` };
  }

  // Update applicant's group with row count
  const { error, count, data: updatedRows } = await supabase
    .from('applicants')
    .update({ group_id: to_group_id }, { count: 'exact' })
    .eq('id', applicantId)
    .eq('company_id', companyId)
    .eq('job_id', jobId)
    .select();

  if (error) {
    console.error('[executeMoveGroup] Update failed:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return { success: false, error: error.message };
  }

  console.log('[executeMoveGroup] Update result:', {
    rowsAffected: count,
    updatedRows,
  });

  if (count === 0) {
    console.error('[executeMoveGroup] CRITICAL: No rows updated!', {
      applicantExists: !!currentApplicant,
      applicantId,
      companyId,
      jobId,
      targetGroupId: to_group_id,
      possibleCauses: [
        'RLS UPDATE policy blocking (check migration 00027)',
        'company_id or job_id mismatch between payload and database',
        'Applicant deleted by concurrent operation',
        'Target group belongs to different board/company',
      ],
    });
    return { success: false, error: 'Failed to move applicant (0 rows updated). Check RLS policies and parameters.' };
  }

  console.log('[executeMoveGroup] ✓ Successfully moved applicant:', {
    name: currentApplicant.full_name,
    applicantId,
    fromGroup: currentApplicant.group_id,
    toGroup: to_group_id,
    toGroupName: targetGroup.name,
    rowsAffected: count,
  });

  return { success: true };
}

/**
 * Action: set_status (legacy - updates applicant.status column)
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
 * Action: change_status (Monday.com-style - updates a specific status column cell)
 * Config: { column_id: uuid, value: uuid (status_label_id) }
 */
async function executeChangeStatus(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { column_id, value } = config;
  const applicantId = payload.applicant_id || payload.subject_id;

  console.log('[executeChangeStatus] Starting:', {
    column_id,
    value,
    applicantId,
  });

  if (!column_id) {
    console.error('[executeChangeStatus] Missing column_id in config');
    return { success: false, error: 'Missing column_id in config' };
  }

  if (!value) {
    console.error('[executeChangeStatus] Missing value (status_label_id) in config');
    return { success: false, error: 'Missing value (status_label_id) in config' };
  }

  if (!applicantId) {
    console.error('[executeChangeStatus] Missing applicant_id in payload');
    return { success: false, error: 'Missing applicant_id in payload' };
  }

  // Verify applicant exists
  const { data: applicant } = await supabase
    .from('applicants')
    .select('id, full_name')
    .eq('id', applicantId)
    .maybeSingle();

  console.log('[executeChangeStatus] Applicant check:', {
    found: !!applicant,
    applicant,
  });

  if (!applicant) {
    console.error('[executeChangeStatus] Applicant not found');
    return { success: false, error: 'Applicant not found or permission denied' };
  }

  // Verify status label exists
  const { data: statusLabel } = await supabase
    .from('board_status_labels')
    .select('id, label')
    .eq('id', value)
    .maybeSingle();

  console.log('[executeChangeStatus] Status label check:', {
    labelId: value,
    labelExists: !!statusLabel,
    labelText: statusLabel?.label,
  });

  if (!statusLabel) {
    console.error('[executeChangeStatus] Status label not found:', value);
    return { success: false, error: `Status label ${value} not found` };
  }

  // Upsert board cell with new status
  const { error, data, count } = await supabase
    .from('board_cells')
    .upsert(
      {
        applicant_id: applicantId,
        column_id: column_id,
        value_text: null,
        value_number: null,
        value_date: null,
        value_status_label_id: value,
      },
      {
        onConflict: 'applicant_id,column_id',
        count: 'exact',
      }
    )
    .select();

  if (error) {
    console.error('[executeChangeStatus] Upsert failed:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return { success: false, error: error.message };
  }

  console.log('[executeChangeStatus] ✓ Successfully changed status:', {
    applicant: applicant.full_name,
    statusLabel: statusLabel.label,
    rowsAffected: count,
    cellData: data,
  });

  return { success: true };
}

/**
 * Action: delete_item
 * Config: {} (no config needed)
 */
async function executeDeleteItem(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const applicantId = payload.applicant_id || payload.subject_id;

  if (!applicantId) {
    return { success: false, error: 'Missing applicant_id in payload' };
  }

  const { error } = await supabase
    .from('applicants')
    .delete()
    .eq('id', applicantId)
    .eq('company_id', companyId)
    .eq('job_id', jobId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Action: set_date
 * Config: { column_id: uuid, value: 'today' | 'tomorrow' | ISO date string }
 */
async function executeSetDate(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { column_id, value } = config;
  const applicantId = payload.applicant_id || payload.subject_id;

  if (!column_id) {
    return { success: false, error: 'Missing column_id in config' };
  }

  if (!value) {
    return { success: false, error: 'Missing value in config' };
  }

  if (!applicantId) {
    return { success: false, error: 'Missing applicant_id in payload' };
  }

  // Resolve relative dates
  let dateValue: string;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (value === 'today') {
    dateValue = today.toISOString().split('T')[0];
  } else if (value === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateValue = tomorrow.toISOString().split('T')[0];
  } else {
    dateValue = value; // Assume ISO date string
  }

  // Upsert board cell with new date
  const { error } = await supabase
    .from('board_cells')
    .upsert(
      {
        applicant_id: applicantId,
        column_id: column_id,
        value_text: null,
        value_number: null,
        value_date: dateValue,
        value_status_label_id: null,
      },
      {
        onConflict: 'applicant_id,column_id',
      }
    );

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Action: set_number
 * Config: { column_id: uuid, value: number }
 */
async function executeSetNumber(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { column_id, value } = config;
  const applicantId = payload.applicant_id || payload.subject_id;

  if (!column_id) {
    return { success: false, error: 'Missing column_id in config' };
  }

  if (value === undefined || value === null) {
    return { success: false, error: 'Missing value in config' };
  }

  if (!applicantId) {
    return { success: false, error: 'Missing applicant_id in payload' };
  }

  // Upsert board cell with new number
  const { error } = await supabase
    .from('board_cells')
    .upsert(
      {
        applicant_id: applicantId,
        column_id: column_id,
        value_text: null,
        value_number: value,
        value_date: null,
        value_status_label_id: null,
      },
      {
        onConflict: 'applicant_id,column_id',
      }
    );

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Action: inc_dec (increment or decrement a number column)
 * Config: { column_id: uuid, operation: 'increment' | 'decrement', amount: number }
 */
async function executeIncDec(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { column_id, operation, amount = 1 } = config;
  const applicantId = payload.applicant_id || payload.subject_id;

  if (!column_id) {
    return { success: false, error: 'Missing column_id in config' };
  }

  if (!operation || !['increment', 'decrement'].includes(operation)) {
    return { success: false, error: 'Invalid operation (must be increment or decrement)' };
  }

  if (!applicantId) {
    return { success: false, error: 'Missing applicant_id in payload' };
  }

  // Fetch current value
  const { data: cell } = await supabase
    .from('board_cells')
    .select('value_number')
    .eq('applicant_id', applicantId)
    .eq('column_id', column_id)
    .single();

  const currentValue = cell?.value_number || 0;
  const newValue = operation === 'increment'
    ? currentValue + amount
    : currentValue - amount;

  // Upsert board cell with new value
  const { error } = await supabase
    .from('board_cells')
    .upsert(
      {
        applicant_id: applicantId,
        column_id: column_id,
        value_text: null,
        value_number: newValue,
        value_date: null,
        value_status_label_id: null,
      },
      {
        onConflict: 'applicant_id,column_id',
      }
    );

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

/**
 * Action: send_slack
 * Config: { webhook_url: string, message: string }
 *
 * NOTE: This sends a message to Slack via incoming webhook.
 */
async function executeSendSlack(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { webhook_url, message } = config;

  if (!webhook_url) {
    return { success: false, error: 'Missing webhook_url in config' };
  }

  if (!message) {
    return { success: false, error: 'Missing message in config' };
  }

  // Render template variables
  const renderTemplate = (template: string, data: Record<string, any>): string => {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  };

  const renderedMessage = renderTemplate(message, payload);

  try {
    const response = await fetch(webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: renderedMessage,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Slack webhook failed with status ${response.status}`
      };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Debug function: Replay/trace a specific automation run by ID
 * Useful for debugging why a run was skipped or failed
 */
export async function debugAutomationRun(
  supabase: SupabaseClient,
  runId: string
): Promise<void> {
  console.log('[debugAutomationRun] ========================================');
  console.log('[debugAutomationRun] Fetching run:', runId);

  // Fetch the automation run
  const { data: run, error: runError } = await supabase
    .from('automation_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (runError || !run) {
    console.error('[debugAutomationRun] Run not found:', runError);
    return;
  }

  console.log('[debugAutomationRun] Run details:', {
    id: run.id,
    status: run.status,
    skip_reason: run.skip_reason,
    error: run.error,
    trigger_key: run.trigger_key,
    automation_id: run.automation_id,
    created_at: run.created_at,
  });

  console.log('[debugAutomationRun] Payload:', run.payload);

  // Fetch the automation
  if (run.automation_id) {
    const { data: automation } = await supabase
      .from('automations')
      .select(`
        id,
        name,
        is_enabled,
        filter,
        automation_actions (
          id,
          type,
          config,
          sort_order
        )
      `)
      .eq('id', run.automation_id)
      .single();

    if (automation) {
      console.log('[debugAutomationRun] Automation:', {
        id: automation.id,
        name: automation.name,
        is_enabled: automation.is_enabled,
        filter: automation.filter,
        actions: automation.automation_actions,
      });

      // Re-evaluate filter
      console.log('[debugAutomationRun] Re-evaluating filter...');
      const filterMatches = matchesFilter(automation.filter, run.payload);
      console.log('[debugAutomationRun] Filter result:', filterMatches ? '✓ MATCH' : '✗ NO MATCH');
    }
  }

  console.log('[debugAutomationRun] ========================================');
}
