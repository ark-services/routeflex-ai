import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import mammoth from 'mammoth';
import { logActivityEvent } from '@/lib/activity/logActivityEvent';

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

  // Chain depth: 0 = user-initiated, 1 = fired by an automation action.
  // We allow depth 1 so that e.g. "move_group" can chain into "send_training_link".
  // Depth 2+ is blocked to prevent runaway cascades.
  const chainDepth = payload._chain_depth ?? 0;

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

      // Block automation chains beyond depth 1 to prevent infinite loops.
      // Depth 0 = user action, depth 1 = automation chained from another automation.
      if (chainDepth >= 2) {
        const skipReason = 'Automation chain limit reached (max 1 level of chaining)';
        console.log('[fireJobTrigger] Skipping automation (chain depth limit):', skipReason);
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
      const filterMatches = await matchesFilter(supabase, automation.filter, payload);

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
      let actionsAttempted = 0;
      let actionsSucceeded = 0;
      let actionsFailed = 0;
      const actionResults: any[] = [];
      const runStartTime = Date.now();

      for (const action of actions) {
        actionsAttempted++;
        console.log('[fireJobTrigger] Executing action:', {
          type: action.type,
          config: action.config,
        });

        const actionStartTime = Date.now();
        try {
          const result = await executeAction(supabase, companyId, jobId, action, payload);
          const actionDuration = Date.now() - actionStartTime;
          console.log('[fireJobTrigger] Action result:', result);

          if (!result.success) {
            actionsFailed++;
            actionResults.push({
              action_id: action.id,
              type: action.type,
              status: 'failed',
              error: result.error,
              duration_ms: actionDuration,
            });
            runStatus = 'failed';
            runError = result.error || 'Action execution failed';
            console.error('[fireJobTrigger] ✗ Action failed:', runError);
            break; // Stop on first failure
          }

          actionsSucceeded++;
          actionResults.push({
            action_id: action.id,
            type: action.type,
            status: 'success',
            duration_ms: actionDuration,
          });
          console.log('[fireJobTrigger] ✓ Action succeeded');

          // ============================================================
          // METERING: Track successful action execution for quota
          // ============================================================
          try {
            console.log('[fireJobTrigger] 💰 Starting metering for successful action...');

            // Get account_id from company
            const { data: company, error: companyError } = await supabase
              .from('companies')
              .select('account_id')
              .eq('id', companyId)
              .single();

            if (companyError) {
              console.error('[fireJobTrigger] ❌ Failed to fetch company for metering:', companyError);
            } else if (!company?.account_id) {
              console.error('[fireJobTrigger] ❌ No account_id found for company:', companyId);
            } else {
              console.log('[fireJobTrigger] Found account_id:', company.account_id);

              // Record 1 unit of action usage (only for successful actions)
              const meteringParams = {
                p_account_id: company.account_id,
                p_units: 1,
                p_source: 'automation',
                p_rule_id: automation.id,
                p_action_id: action.id,
                p_applicant_id: payload.applicant_id || null,
                p_company_id: companyId,
                p_status: 'completed',
                p_metadata: {
                  automation_name: automation.name,
                  action_type: action.type,
                  trigger_key,
                }
              };

              console.log('[fireJobTrigger] Calling record_action_usage RPC...');
              console.log('[fireJobTrigger] RPC params:', JSON.stringify(meteringParams, null, 2));

              const { data: meteringResult, error: meteringError } = await supabase.rpc('record_action_usage', meteringParams);

              if (meteringError) {
                console.error('[fireJobTrigger] ❌ Metering RPC error (non-fatal):', meteringError);
                console.error('[fireJobTrigger] Error details:', {
                  message: meteringError.message,
                  details: meteringError.details,
                  hint: meteringError.hint,
                  code: meteringError.code,
                  stack: meteringError.stack,
                });
                console.error('[fireJobTrigger] Full error object:', JSON.stringify(meteringError, null, 2));
                // Don't fail automation on metering error
              } else {
                console.log('[fireJobTrigger] ✓✓✓ SUCCESS! Metering RPC completed');
                console.log('[fireJobTrigger] Ledger ID returned:', meteringResult);
                console.log('[fireJobTrigger] This means the action was counted toward quota');
              }
            }
          } catch (meteringErr) {
            console.error('[fireJobTrigger] ❌ Metering exception (non-fatal):', meteringErr);
            // Continue execution even if metering fails
          }
          // ============================================================
        } catch (err: any) {
          const actionDuration = Date.now() - actionStartTime;
          actionsFailed++;
          actionResults.push({
            action_id: action.id,
            type: action.type,
            status: 'failed',
            error: err.message,
            duration_ms: actionDuration,
          });
          runStatus = 'failed';
          runError = err.message || 'Unexpected error during action execution';
          console.error('[fireJobTrigger] ✗ Action threw error:', err);
          break;
        }
      }

      const totalDuration = Date.now() - runStartTime;

      console.log('[fireJobTrigger] Final run status:', runStatus);
      console.log('[fireJobTrigger] Actions attempted:', actionsAttempted);
      console.log('[fireJobTrigger] Actions succeeded:', actionsSucceeded);
      console.log('[fireJobTrigger] Actions failed:', actionsFailed);
      console.log('[fireJobTrigger] Total duration:', totalDuration, 'ms');
      console.log('[fireJobTrigger] Run error:', runError || 'none');

      // Log automation run with detailed metrics.
      // _automation_name is embedded in payload so the client-side realtime
      // subscriber can display "Automation Running: <name>" toasts without
      // an extra round-trip query.
      const { error: insertError } = await supabase.from('automation_runs').insert({
        company_id: companyId,
        job_id: jobId,
        automation_id: automation.id,
        trigger_key,
        subject_type,
        subject_id,
        payload: { ...payload, _automation_name: automation.name || null },
        status: runStatus,
        error: runError,
        skip_reason: null, // Not skipped if we got here
        actions_attempted: actionsAttempted,
        actions_succeeded: actionsSucceeded,
        actions_failed: actionsFailed,
        duration_ms: totalDuration,
        action_results: actionResults,
      });

      if (insertError) {
        console.error('[fireJobTrigger] Failed to insert automation_run:', insertError);
      } else {
        console.log('[fireJobTrigger] ✓ Automation run logged successfully');
      }

      // Log automation run result to activity_events (non-fatal)
      try {
        const runId = (await supabase
          .from('automation_runs')
          .select('id')
          .eq('company_id', companyId)
          .eq('job_id', jobId)
          .eq('automation_id', automation.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()).data?.id ?? null;

        if (runStatus === 'success') {
          await logActivityEvent(supabase, {
            companyId,
            jobId,
            actorType: 'automation',
            eventType: 'automation.run.completed',
            entityType: 'automation',
            entityId: automation.id,
            summary: `Automation "${automation.name}" ran successfully`,
            data: {
              automation_name: automation.name,
              automation_run_id: runId,
              duration_ms: totalDuration,
            },
          });
        } else {
          await logActivityEvent(supabase, {
            companyId,
            jobId,
            actorType: 'automation',
            eventType: 'automation.run.failed',
            entityType: 'automation',
            entityId: automation.id,
            summary: `Automation "${automation.name}" failed: ${runError ?? 'unknown error'}`,
            data: {
              automation_name: automation.name,
              automation_run_id: runId,
              duration_ms: totalDuration,
              error: runError ?? null,
            },
          });
        }
      } catch {}

      console.log('[fireJobTrigger] ========================================');
    }
  } catch (err) {
    console.error('[fireJobTrigger] Unexpected error:', err);
  }
}

/**
 * Matches automation filter against event payload.
 * Handles both the legacy trigger-config keys (column_id, changes_to) and
 * the newer "and only if…" conditions array.
 *
 * Special key mappings:
 * - filter.column_id  → payload.column_id  (trigger column UUID)
 * - filter.changes_to → payload.new_value  (status label UUID)
 * - filter.conditions → evaluated via evaluateConditions() (async DB reads)
 * - filter.operator   → skipped (reserved for future OR support)
 * - filter._*         → skipped (template annotation fields)
 */
async function matchesFilter(
  supabase: SupabaseClient,
  filter: any,
  payload: Record<string, any>
): Promise<boolean> {
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
    // Skip reserved/annotation keys — handled separately below
    if (key === 'conditions' || key === 'operator') continue;
    if (key.startsWith('_')) continue; // template annotation fields (_column_name etc.)

    // Special handling for column_id match (for board.status_changes_to trigger)
    if (key === 'column_id') {
      const matches = payload.column_id === value;
      console.log(`[matchesFilter] column_id: filter=${value}, payload=${payload.column_id}, match=${matches}`);
      if (!matches) return false;
      continue;
    }

    // Special handling for changes_to match (maps to payload.new_value UUID, NOT new_label text)
    if (key === 'changes_to') {
      const matches = payload.new_value === value;
      console.log(`[matchesFilter] changes_to: filter=${value}, payload.new_value=${payload.new_value}, payload.new_label="${payload.new_label}", match=${matches}`);
      if (!matches) return false;
      continue;
    }

    // Special handling for to_group_id: only relevant for applicant.moved_group events
    // (those include to_group_id in their payload). For status-change and other events
    // the payload has no to_group_id — skip rather than failing the match, because this
    // key can end up in the filter as stale data when a user switches trigger types in the UI.
    if (key === 'to_group_id') {
      if (payload.to_group_id === undefined || payload.to_group_id === null) {
        console.log(`[matchesFilter] to_group_id: payload has no to_group_id — skipping (stale filter key)`);
        continue;
      }
      const matches = payload.to_group_id === value;
      console.log(`[matchesFilter] to_group_id: filter=${value}, payload=${payload.to_group_id}, match=${matches}`);
      if (!matches) return false;
      continue;
    }

    // Generic key match for any other filter keys
    const matches = payload[key] === value;
    console.log(`[matchesFilter] ${key}: filter=${value}, payload=${payload[key]}, match=${matches}`);
    if (!matches) return false;
  }

  // Evaluate "and only if…" conditions (AND logic — all must pass)
  if (Array.isArray(filter.conditions) && filter.conditions.length > 0) {
    console.log(`[matchesFilter] Evaluating ${filter.conditions.length} additional condition(s)…`);
    const conditionsPass = await evaluateConditions(supabase, filter.conditions, payload);
    if (!conditionsPass) {
      console.log('[matchesFilter] ✗ Additional conditions did not pass');
      return false;
    }
  }

  console.log('[matchesFilter] ✓ All filter conditions matched');
  return true;
}

/**
 * Evaluates an array of FilterConditions with AND logic.
 * Returns false as soon as any condition fails.
 */
async function evaluateConditions(
  supabase: SupabaseClient,
  conditions: any[],
  payload: Record<string, any>
): Promise<boolean> {
  for (const condition of conditions) {
    const passes = await evaluateCondition(supabase, condition, payload);
    console.log(
      `[evaluateCondition] type="${condition.type}" col="${condition.column_id}" value="${condition.value}": ${passes ? '✓' : '✗'}`
    );
    if (!passes) return false; // AND — short-circuit on first failure
  }
  return true;
}

/**
 * Evaluates a single filter condition against the event payload.
 *
 * Optimization: if the condition references the same column that triggered
 * the event, the value is read from the payload (no DB round-trip).
 * Otherwise the current cell value is fetched from board_cells.
 *
 * Missing context (no applicant_id, no board_cell found) → returns false.
 */
async function evaluateCondition(
  supabase: SupabaseClient,
  condition: any,
  payload: Record<string, any>
): Promise<boolean> {
  const { type, column_id, value } = condition;
  const applicantId: string | undefined = payload.applicant_id || payload.subject_id;

  if (!applicantId) {
    console.warn('[evaluateCondition] No applicant_id in payload — condition cannot be evaluated');
    return false;
  }

  // ── item_in_group: check applicant's current group ────────────────────────
  if (type === 'item_in_group') {
    // Use payload group_id if available (e.g. applicant.moved_group trigger)
    if (payload.group_id) return payload.group_id === value;
    const { data: applicant } = await supabase
      .from('applicants')
      .select('group_id')
      .eq('id', applicantId)
      .maybeSingle();
    return applicant?.group_id === value;
  }

  if (!column_id) {
    console.warn(`[evaluateCondition] No column_id for condition type "${type}"`);
    return false;
  }

  // ── is_empty / is_not_empty: check whether any cell value is present ──────
  // Works for all column types including file (stored as value_text).
  // A missing board_cell row counts as empty.
  if (type === 'is_empty' || type === 'is_not_empty') {
    // Use payload data when the condition references the triggering column
    if (column_id === payload.column_id) {
      const txt = payload.new_value_text ?? payload.value_text ?? null;
      const num = payload.new_value_number ?? payload.value_number ?? null;
      const dt  = payload.new_value_date   ?? payload.value_date   ?? null;
      const st  = payload.new_value        ?? null;
      const hasValue = (txt != null && txt !== '') || num != null ||
                       (dt  != null && dt  !== '') || (st != null && st !== '');
      return type === 'is_not_empty' ? hasValue : !hasValue;
    }
    const { data: cell } = await supabase
      .from('board_cells')
      .select('value_text, value_number, value_date, value_status_label_id')
      .eq('applicant_id', applicantId)
      .eq('column_id', column_id)
      .maybeSingle();
    if (!cell) return type === 'is_empty'; // missing row = empty
    const hasValue =
      (cell.value_text != null && cell.value_text !== '') ||
      cell.value_number != null ||
      (cell.value_date != null && cell.value_date !== '') ||
      (cell.value_status_label_id != null && cell.value_status_label_id !== '');
    return type === 'is_not_empty' ? hasValue : !hasValue;
  }

  // ── Resolve cell value ────────────────────────────────────────────────────
  let cellValue: string | number | null = null;

  // Use payload data when the condition references the triggering column
  if (column_id === payload.column_id) {
    if (type.startsWith('status_'))  cellValue = payload.new_value ?? null;
    else if (type.startsWith('text_'))   cellValue = payload.new_value_text ?? payload.value_text ?? null;
    else if (type.startsWith('number_')) cellValue = payload.new_value_number ?? payload.value_number ?? null;
    else if (type.startsWith('date_'))   cellValue = payload.new_value_date ?? payload.value_date ?? null;
  }

  // Fall back to DB read for any other column
  if (cellValue === null || cellValue === undefined) {
    const { data: cell } = await supabase
      .from('board_cells')
      .select('value_text, value_number, value_date, value_status_label_id')
      .eq('applicant_id', applicantId)
      .eq('column_id', column_id)
      .maybeSingle();

    if (!cell) {
      console.warn(
        `[evaluateCondition] No board_cell found for applicant=${applicantId} column=${column_id} — treating as fail`
      );
      return false;
    }

    if      (type.startsWith('status_'))  cellValue = cell.value_status_label_id ?? null;
    else if (type.startsWith('text_'))    cellValue = cell.value_text ?? null;
    else if (type.startsWith('number_'))  cellValue = cell.value_number ?? null;
    else if (type.startsWith('date_'))    cellValue = cell.value_date ?? null;
  }

  // ── Evaluate ──────────────────────────────────────────────────────────────
  switch (type) {
    case 'status_is':
      return String(cellValue ?? '') === String(value);
    case 'status_is_not':
      return String(cellValue ?? '') !== String(value);

    case 'text_equals':
      return (cellValue ?? '').toString().toLowerCase() === (value ?? '').toString().toLowerCase();
    case 'text_contains':
      return (cellValue ?? '').toString().toLowerCase().includes((value ?? '').toString().toLowerCase());

    case 'number_eq':   return Number(cellValue) === Number(value);
    case 'number_gt':   return Number(cellValue) >   Number(value);
    case 'number_gte':  return Number(cellValue) >=  Number(value);
    case 'number_lt':   return Number(cellValue) <   Number(value);
    case 'number_lte':  return Number(cellValue) <=  Number(value);

    case 'date_is':     return String(cellValue ?? '') === String(value);
    case 'date_before': return String(cellValue ?? '') <   String(value);
    case 'date_after':  return String(cellValue ?? '') >   String(value);

    default:
      console.warn(`[evaluateCondition] Unknown condition type "${type}" — treating as fail`);
      return false;
  }
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

    case 'email_gmail':
      return executeEmailGmail(supabase, companyId, jobId, config, payload);

    case 'send_email_gmail':
      return executeSendEmailGmail(supabase, companyId, jobId, config, payload);

    case 'twilio.send_sms':
      return executeTwilioSendSms(supabase, companyId, jobId, config, payload);

    case 'twilio.make_call_say':
      return executeTwilioMakeCallSay(supabase, companyId, jobId, config, payload);

    case 'integration.set_field':
      return executeIntegrationSetField(supabase, companyId, jobId, config, payload);

    case 'fadv.add_subject':
      return executeFadvAddSubject(supabase, companyId, jobId, config, payload);

    case 'safety_trainer.submit':
      return executeSafetyTrainerSubmit(supabase, companyId, jobId, config, payload);

    case 'lms.send_training_link':
      return executeLmsSendTrainingLink(supabase, companyId, jobId, config, payload);
    case 'portal.send_link':
      return executePortalSendLink(supabase, companyId, jobId, config, payload);

    case 'ai.score_resume':
      return executeAiScoreResume(supabase, companyId, jobId, config, payload);

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

  // Fire applicant.moved_group so downstream automations can react
  // (e.g., "when moved to Road Test → send training link").
  // We increment _chain_depth so cascading chains beyond depth 1 are blocked.
  try {
    await fireJobTrigger(supabase, {
      companyId,
      jobId,
      trigger_key: 'applicant.moved_group',
      subject_type: 'applicant',
      subject_id: applicantId,
      payload: {
        company_id: companyId,
        job_id: jobId,
        applicant_id: applicantId,
        from_group_id: currentApplicant.group_id,
        to_group_id,
        _chain_depth: (payload._chain_depth ?? 0) + 1,
      },
    });
  } catch (chainErr) {
    console.warn('[executeMoveGroup] Chain trigger error (non-fatal):', chainErr);
  }

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
 * Validate that a webhook URL is safe (not targeting internal infrastructure).
 */
function isAllowedWebhookUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host)) return false;
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
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

  if (!isAllowedWebhookUrl(url)) {
    return { success: false, error: 'Webhook URL targets a blocked address (localhost or private network)' };
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

  if (!isAllowedWebhookUrl(webhook_url)) {
    return { success: false, error: 'Slack webhook URL targets a blocked address (localhost or private network)' };
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
 * Action: email_gmail
 * Config: { gmail_connection_id: uuid, recipient_column_id: uuid, subject: string, body: string }
 *
 * NOTE: Sends email via Gmail API using stored OAuth credentials
 */
async function executeEmailGmail(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { gmail_connection_id, recipient_column_id, subject, body } = config;
  const applicantId = payload.applicant_id || payload.subject_id;

  // Validate config
  if (!gmail_connection_id || !recipient_column_id || !subject || !body || !applicantId) {
    return { success: false, error: 'Missing required config or applicant_id' };
  }

  // Get applicant data
  const { data: applicant } = await supabase
    .from('applicants')
    .select('full_name, email, company_id')
    .eq('id', applicantId)
    .single();

  if (!applicant) {
    return { success: false, error: 'Applicant not found' };
  }

  // Get company and job data
  const { data: company } = await supabase
    .from('companies')
    .select('name, account_id')
    .eq('id', companyId)
    .single();

  const { data: job } = await supabase
    .from('jobs')
    .select('title')
    .eq('id', jobId)
    .single();

  // Get recipient email — three-tier fallback:
  // 1. board_cells (manual board edits)
  // 2. applicant_field_values via board_columns.field_id (form submissions)
  // 3. applicants.email (direct record field)
  const { data: recipientCell } = await supabase
    .from('board_cells')
    .select('value_text')
    .eq('applicant_id', applicantId)
    .eq('column_id', recipient_column_id)
    .maybeSingle();

  let recipientEmail: string | null | undefined = recipientCell?.value_text;

  if (!recipientEmail) {
    const { data: boardCol } = await supabase
      .from('board_columns')
      .select('field_id')
      .eq('id', recipient_column_id)
      .maybeSingle();
    if (boardCol?.field_id) {
      const { data: fieldVal } = await supabase
        .from('applicant_field_values')
        .select('value_text')
        .eq('applicant_id', applicantId)
        .eq('field_id', boardCol.field_id)
        .maybeSingle();
      recipientEmail = fieldVal?.value_text;
    }
  }

  if (!recipientEmail) {
    recipientEmail = applicant?.email || null;
  }

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { success: false, error: 'Invalid or missing recipient email' };
  }

  // Build variable context — basic fields + all board column values
  const nameParts = (applicant.full_name || '').split(' ');
  const context: Record<string, any> = {
    applicant_name: applicant.full_name || 'N/A',
    first_name: nameParts[0] || 'N/A',
    last_name: nameParts.slice(1).join(' ') || 'N/A',
    applicant_email: applicant.email || 'N/A',
    company_name: company?.name || 'N/A',
    job_title: job?.title || 'N/A',
  };

  // Fetch board columns (with field_id to bridge applicant_field_values)
  const { data: allColumns } = await supabase
    .from('board_columns')
    .select('id, name, field_id')
    .eq('company_id', companyId);

  // Fetch cell values from board_cells
  const { data: allCells } = await supabase
    .from('board_cells')
    .select('column_id, value_text, value_number, value_date')
    .eq('applicant_id', applicantId);

  // Fetch cell values from applicant_field_values (form submissions)
  const { data: allFieldValues } = await supabase
    .from('applicant_field_values')
    .select('field_id, value_text, value_number, value_date')
    .eq('applicant_id', applicantId);

  if (allColumns) {
    const fieldValuesByFieldId = new Map(
      (allFieldValues ?? []).map((fv: any) => [fv.field_id, fv])
    );
    for (const column of allColumns) {
      const key = colNameToToken(column.name);
      const cell = (allCells ?? []).find((c: any) => c.column_id === column.id);
      if (cell?.value_text || cell?.value_number != null || cell?.value_date) {
        context[key] = cell.value_text || cell.value_number?.toString() || cell.value_date || '';
      } else if (column.field_id) {
        const fv = fieldValuesByFieldId.get(column.field_id);
        if (fv) {
          context[key] = fv.value_text || fv.value_number?.toString() || fv.value_date || '';
        }
      }
    }
  }

  const resolvedSubject = resolveVariables(subject, context);
  const resolvedBody = plainTextToHtml(resolveVariables(body, context));

  // Get Gmail client — company-scoped (new path)
  const { getGmailClientForCompany, sendEmail: sendEmailGmail } = await import('@/lib/gmail-send');
  const gmailClient = await getGmailClientForCompany(supabase, companyId);

  if (!gmailClient) {
    return { success: false, error: 'Gmail account not connected or expired' };
  }

  // Send email
  const result = await sendEmailGmail(gmailClient.gmail, {
    to: recipientEmail,
    subject: resolvedSubject,
    body: resolvedBody,
  });

  return result.success
    ? { success: true }
    : { success: false, error: result.error };
}

/**
 * Action: send_email_gmail (per-user Gmail integration)
 * Config: { connection_id: uuid, recipient_column_id: uuid, subject: string, body: string }
 */
async function executeSendEmailGmail(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { connection_id, recipient_column_id, subject, body } = config;
  const applicantId = payload.applicant_id || payload.subject_id;

  // recipient_column_id and subject are required; connection_id is optional
  // (legacy field — we now resolve Gmail client by companyId)
  if (!recipient_column_id || !subject || !applicantId) {
    return { success: false, error: 'Missing required config fields' };
  }

  // Get applicant data
  const { data: applicant } = await supabase
    .from('applicants')
    .select('full_name, email')
    .eq('id', applicantId)
    .single();

  if (!applicant) {
    return { success: false, error: 'Applicant not found' };
  }

  // Get company and job data for variables
  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .single();

  const { data: job } = await supabase
    .from('jobs')
    .select('title')
    .eq('id', jobId)
    .single();

  // Get recipient email — three-tier fallback:
  // 1. board_cells (manual board edits)
  // 2. applicant_field_values via board_columns.field_id (form submissions)
  // 3. applicants.email (direct record field)
  const { data: recipientCell } = await supabase
    .from('board_cells')
    .select('value_text')
    .eq('applicant_id', applicantId)
    .eq('column_id', recipient_column_id)
    .maybeSingle();

  let recipientEmail: string | null | undefined = recipientCell?.value_text;

  if (!recipientEmail) {
    const { data: boardCol } = await supabase
      .from('board_columns')
      .select('field_id')
      .eq('id', recipient_column_id)
      .maybeSingle();
    if (boardCol?.field_id) {
      const { data: fieldVal } = await supabase
        .from('applicant_field_values')
        .select('value_text')
        .eq('applicant_id', applicantId)
        .eq('field_id', boardCol.field_id)
        .maybeSingle();
      recipientEmail = fieldVal?.value_text;
    }
  }

  if (!recipientEmail) {
    recipientEmail = applicant?.email || null;
  }

  // Validate email
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { success: false, error: 'Invalid or missing recipient email' };
  }

  // Build variable context — basic fields + all board column values
  const nameParts = (applicant.full_name || '').split(' ');
  const context: Record<string, any> = {
    applicant_name: applicant.full_name || 'N/A',
    first_name: nameParts[0] || 'N/A',
    last_name: nameParts.slice(1).join(' ') || 'N/A',
    applicant_email: applicant.email || 'N/A',
    company_name: company?.name || 'N/A',
    job_title: job?.title || 'N/A',
  };

  // Fetch board columns (with field_id to bridge applicant_field_values)
  const { data: allColumns } = await supabase
    .from('board_columns')
    .select('id, name, field_id')
    .eq('company_id', companyId);

  // Fetch cell values from board_cells (manually set on the board)
  const { data: allCells } = await supabase
    .from('board_cells')
    .select('column_id, value_text, value_number, value_date')
    .eq('applicant_id', applicantId);

  // Fetch cell values from applicant_field_values (form submissions)
  const { data: allFieldValues } = await supabase
    .from('applicant_field_values')
    .select('field_id, value_text, value_number, value_date')
    .eq('applicant_id', applicantId);

  if (allColumns) {
    const fieldValuesByFieldId = new Map(
      (allFieldValues ?? []).map((fv: any) => [fv.field_id, fv])
    );
    for (const column of allColumns) {
      const key = colNameToToken(column.name);
      const cell = (allCells ?? []).find((c: any) => c.column_id === column.id);
      if (cell?.value_text || cell?.value_number != null || cell?.value_date) {
        context[key] = cell.value_text || cell.value_number?.toString() || cell.value_date || '';
      } else if (column.field_id) {
        const fv = fieldValuesByFieldId.get(column.field_id);
        if (fv) {
          context[key] = fv.value_text || fv.value_number?.toString() || fv.value_date || '';
        }
      }
    }
  }

  // Resolve variables in subject and body; convert plain-text newlines to <br>
  const resolvedSubject = resolveVariables(subject, context);
  const resolvedBody = plainTextToHtml(resolveVariables(body || '', context));

  // Get Gmail client — prefer company-scoped lookup; fall back to connection_id (legacy)
  const { getGmailClientForCompany, getGmailClientForConnection, sendEmail } = await import('@/lib/gmail-send');
  let gmailClient = await getGmailClientForCompany(supabase, companyId);

  if (!gmailClient && connection_id) {
    gmailClient = await getGmailClientForConnection(supabase, connection_id);
  }

  if (!gmailClient) {
    return { success: false, error: 'Gmail connection expired or not configured for this company' };
  }

  // Send email
  const result = await sendEmail(gmailClient.gmail, {
    to: recipientEmail,
    subject: resolvedSubject,
    body: resolvedBody,
  });

  // Log send (without full body for PII protection)
  console.log('[executeSendEmailGmail] Email sent:', {
    success: result.success,
    from: gmailClient.emailAddress,
    to: recipientEmail,
    subject: resolvedSubject,
    messageId: result.messageId,
    error: result.error,
  });

  return result.success
    ? { success: true }
    : { success: false, error: result.error };
}

/**
 * Action: twilio.send_sms
 * Config: { toSource: { type: 'column'|'manual', columnId?: string, value?: string }, message: string, onlyIfPresent?: boolean }
 */
async function executeTwilioSendSms(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { toSource, message, onlyIfPresent = true } = config;
  const applicantId = payload.applicant_id || payload.subject_id;

  if (!message) {
    return { success: false, error: 'Missing message in Twilio SMS config' };
  }

  // Fetch Twilio credentials via service role (auth_token_encrypted must never go to client)
  const connection = await fetchTwilioConnection(companyId);
  if (!connection) {
    return { success: false, error: 'Twilio is not connected for this company' };
  }
  if (!connection.is_enabled) {
    return { success: false, error: 'Twilio integration is disabled' };
  }

  // Resolve "to" phone number
  const toNumber = await resolvePhoneNumber(supabase, toSource, applicantId);

  if (!toNumber) {
    if (onlyIfPresent) {
      return { success: false, error: 'No phone number found for recipient (toSource resolved empty)' };
    }
    console.log('[executeTwilioSendSms] No phone number — skipping gracefully (onlyIfPresent=false)');
    return { success: true };
  }

  // Validate E.164
  const E164_RE = /^\+[1-9]\d{1,14}$/;
  if (!E164_RE.test(toNumber)) {
    return { success: false, error: `Phone number "${toNumber}" is not in E.164 format (e.g. +15551234567)` };
  }

  // Build template context
  const context = await buildTwilioVariableContext(supabase, companyId, jobId, applicantId, payload);
  const resolvedMessage = resolveVariables(message, context);

  // Decrypt and send
  const { decrypt } = await import('@/lib/encryption');
  const authToken = decrypt(connection.auth_token_encrypted);

  const { sendSms } = await import('@/lib/twilio');
  const result = await sendSms(
    connection.account_sid,
    authToken,
    connection.from_number,
    toNumber,
    resolvedMessage
  );

  console.log('[executeTwilioSendSms]', {
    success: result.success,
    to: maskPhone(toNumber),
    sid: result.sid,
    error: result.error,
  });

  return result.success
    ? { success: true }
    : { success: false, error: result.error };
}

/**
 * Action: twilio.make_call_say
 * Config: { toSource: { type: 'column'|'manual', columnId?: string, value?: string }, say: string, onlyIfPresent?: boolean }
 */
async function executeTwilioMakeCallSay(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { toSource, say, onlyIfPresent = true } = config;
  const applicantId = payload.applicant_id || payload.subject_id;

  if (!say) {
    return { success: false, error: 'Missing say text in Twilio call config' };
  }

  // Fetch Twilio credentials via service role
  const connection = await fetchTwilioConnection(companyId);
  if (!connection) {
    return { success: false, error: 'Twilio is not connected for this company' };
  }
  if (!connection.is_enabled) {
    return { success: false, error: 'Twilio integration is disabled' };
  }

  // Resolve "to" phone number
  const toNumber = await resolvePhoneNumber(supabase, toSource, applicantId);

  if (!toNumber) {
    if (onlyIfPresent) {
      return { success: false, error: 'No phone number found for recipient (toSource resolved empty)' };
    }
    console.log('[executeTwilioMakeCallSay] No phone number — skipping gracefully (onlyIfPresent=false)');
    return { success: true };
  }

  // Validate E.164
  const E164_RE = /^\+[1-9]\d{1,14}$/;
  if (!E164_RE.test(toNumber)) {
    return { success: false, error: `Phone number "${toNumber}" is not in E.164 format (e.g. +15551234567)` };
  }

  // Build template context
  const context = await buildTwilioVariableContext(supabase, companyId, jobId, applicantId, payload);
  const resolvedSay = resolveVariables(say, context);

  // Decrypt and call
  const { decrypt } = await import('@/lib/encryption');
  const authToken = decrypt(connection.auth_token_encrypted);

  const { makeCallSay } = await import('@/lib/twilio');
  const result = await makeCallSay(
    connection.account_sid,
    authToken,
    connection.from_number,
    toNumber,
    resolvedSay
  );

  console.log('[executeTwilioMakeCallSay]', {
    success: result.success,
    to: maskPhone(toNumber),
    sid: result.sid,
    error: result.error,
  });

  return result.success
    ? { success: true }
    : { success: false, error: result.error };
}

// ── Twilio helpers ──────────────────────────────────────────────────────────

/**
 * Fetch Twilio connection credentials using the service role client.
 * The auth_token_encrypted column must be decrypted server-side only.
 */
async function fetchTwilioConnection(companyId: string): Promise<{
  account_sid: string;
  auth_token_encrypted: string;
  from_number: string;
  is_enabled: boolean;
} | null> {
  const { createClient: createServiceClient } = await import('@supabase/supabase-js');
  const svcClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data } = await svcClient
    .from('twilio_connections')
    .select('account_sid, auth_token_encrypted, from_number, is_enabled')
    .eq('company_id', companyId)
    .maybeSingle();
  return data ?? null;
}

/**
 * Resolve the "to" phone number from a toSource config object.
 * Returns null if unresolvable.
 */
async function resolvePhoneNumber(
  supabase: SupabaseClient,
  toSource: { type?: string; columnId?: string; value?: string } | undefined,
  applicantId: string | undefined
): Promise<string | null> {
  if (!toSource) return null;

  if (toSource.type === 'manual') {
    return toSource.value?.trim() || null;
  }

  // column type: read from board_cells
  if (toSource.type === 'column' && toSource.columnId && applicantId) {
    const { data: cell } = await supabase
      .from('board_cells')
      .select('value_text')
      .eq('applicant_id', applicantId)
      .eq('column_id', toSource.columnId)
      .maybeSingle();
    return cell?.value_text?.trim() || null;
  }

  return null;
}

/**
 * Build a template variable context for Twilio actions.
 * Includes applicant fields, job/company fields, and all board column values.
 */
async function buildTwilioVariableContext(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  applicantId: string | undefined,
  payload: Record<string, any>
): Promise<Record<string, string>> {
  const context: Record<string, string> = {};

  // Applicant fields
  if (applicantId) {
    const { data: applicant } = await supabase
      .from('applicants')
      .select('full_name, email, group_id')
      .eq('id', applicantId)
      .maybeSingle();

    if (applicant) {
      context.applicant_name = applicant.full_name || '';
      context.applicant_email = applicant.email || '';
      context.item_id = applicantId;

      if (applicant.group_id) {
        const { data: group } = await supabase
          .from('board_groups')
          .select('name')
          .eq('id', applicant.group_id)
          .maybeSingle();
        if (group) context.group_name = group.name || '';
      }
    }

    // All board column values for this applicant
    const { data: allColumns } = await supabase
      .from('board_columns')
      .select('id, name')
      .eq('company_id', companyId);

    const { data: allCells } = await supabase
      .from('board_cells')
      .select('column_id, value_text, value_number, value_date')
      .eq('applicant_id', applicantId);

    if (allColumns && allCells) {
      for (const column of allColumns) {
        const cell = allCells.find((c) => c.column_id === column.id);
        const key = column.name.toLowerCase().replace(/\s+/g, '_');
        if (cell) {
          context[key] = String(cell.value_text ?? cell.value_number ?? cell.value_date ?? '');
        }
      }
    }
  }

  // Company name
  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  if (company) context.company_name = company.name || '';

  // Job title
  const { data: job } = await supabase
    .from('jobs')
    .select('title')
    .eq('id', jobId)
    .maybeSingle();
  if (job) context.job_title = job.title || '';

  return context;
}

/**
 * Mask a phone number for safe logging: +1******2147
 */
function maskPhone(phone: string): string {
  if (phone.length <= 7) return phone.slice(0, 2) + '****';
  return phone.slice(0, 3) + '******' + phone.slice(-4);
}

/**
 * Action: integration.set_field
 * Sets a per-applicant integration field (e.g. FADV package, location).
 *
 * Config:
 *   provider   — "fadv"
 *   field_key  — "package" | "location" | "facility_id" | "position_type"
 *   value      — string value to set (static for MVP)
 */
async function executeIntegrationSetField(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { provider, field_key, value } = config;
  const applicantId: string | undefined = payload.applicant_id || payload.subject_id;

  if (!provider) {
    return { success: false, error: 'integration.set_field: missing provider in config' };
  }
  if (!field_key) {
    return { success: false, error: 'integration.set_field: missing field_key in config' };
  }
  if (!applicantId) {
    return { success: false, error: 'integration.set_field: missing applicant_id in payload' };
  }

  const resolvedValue = value != null ? String(value) : null;

  console.log('[executeIntegrationSetField]', {
    provider,
    field_key,
    value: resolvedValue,
    applicantId,
    companyId,
    jobId,
  });

  // Fetch existing fields row to merge
  const { data: existing } = await supabase
    .from('applicant_integration_fields')
    .select('fields')
    .eq('applicant_id', applicantId)
    .eq('provider', provider)
    .maybeSingle();

  const existingFields = (existing?.fields ?? {}) as Record<string, string | null>;
  const updatedFields = { ...existingFields, [field_key]: resolvedValue };

  const { error } = await supabase
    .from('applicant_integration_fields')
    .upsert(
      {
        applicant_id: applicantId,
        company_id: companyId,
        job_id: jobId,
        provider,
        fields: updatedFields,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'applicant_id,provider' }
    );

  if (error) {
    console.error('[executeIntegrationSetField] DB error:', error);
    return { success: false, error: `Failed to set ${provider}.${field_key}: ${error.message}` };
  }

  // Also sync to board_cells if there's a fadv.* column of the matching type on the board
  try {
    const fadvColumnType = `fadv.${field_key}`;
    const { data: board } = await supabase
      .from('boards')
      .select('id')
      .eq('company_id', companyId)
      .eq('job_id', jobId)
      .maybeSingle();

    if (board) {
      const { data: col } = await supabase
        .from('board_columns')
        .select('id')
        .eq('board_id', board.id)
        .eq('type', fadvColumnType)
        .maybeSingle();

      if (col) {
        await supabase
          .from('board_cells')
          .upsert(
            {
              applicant_id: applicantId,
              column_id: col.id,
              value_text: resolvedValue,
              value_number: null,
              value_date: null,
              value_status_label_id: null,
              value_file_path: null,
            },
            { onConflict: 'applicant_id,column_id' }
          );
      }
    }
  } catch (syncErr) {
    // Non-fatal: applicant_integration_fields already updated
    console.error('[executeIntegrationSetField] board_cells sync failed (non-fatal):', syncErr);
  }

  console.log('[executeIntegrationSetField] ✓ Set', `${provider}.${field_key}`, '=', resolvedValue);
  return { success: true };
}

/**
 * Helper: Resolve template variables in a string
 */
function resolveVariables(template: string, context: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return context[key]?.toString() || match;
  });
}

/**
 * Helper: Convert a plain-text email body to HTML-safe format.
 * If the body already contains HTML tags it is returned as-is.
 * Otherwise newlines are converted to <br> tags so the email renders
 * correctly when sent with Content-Type: text/html.
 */
function plainTextToHtml(body: string): string {
  if (/<[a-z][\s\S]*?>/i.test(body)) return body; // already HTML
  return body.replace(/\n/g, '<br>\n');
}

/**
 * Helper: Build a slug key from a column name matching the {{token}} convention.
 * e.g. "Vehicle Make and Model" → "vehicle_make_and_model"
 */
function colNameToToken(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Action: fadv.add_subject
 *
 * Validates three input text columns on the applicant's board row, then
 * enqueues a background FADV submission by inserting an integration_submissions
 * row with status = 'queued'.  The Vercel cron job at /api/fadv/process-queue
 * picks up the row, calls the FADV API, and writes the final result back to
 * output_column_id.
 *
 * Config:
 *   package_column_id       — text column holding the FADV Package value
 *   facility_id_column_id   — text column holding the Facility ID value
 *   position_type_column_id — text column holding the Position Type value
 *   output_column_id        — text column where status messages are written
 *
 * Execution behaviours:
 *   • Missing config keys          → hard failure (return success: false)
 *   • Missing applicant cell values → write error to output column, return success: true
 *   • Already successfully submitted → write "already submitted" message, return success: true
 *   • DB insert failure            → hard failure (return success: false)
 *   • Happy path                   → write "queued" to output column, return success: true
 */
async function executeFadvAddSubject(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const {
    package_column_id,
    facility_id_column_id,
    position_type_column_id,
    first_name_column_id,
    last_name_column_id,
    email_column_id,
    output_column_id,
    subject_id_column_id,
  } = config;

  const applicantId: string | undefined = payload.applicant_id || payload.subject_id;

  console.log('[executeFadvAddSubject] Starting:', {
    package_column_id,
    facility_id_column_id,
    position_type_column_id,
    first_name_column_id,
    last_name_column_id,
    email_column_id,
    output_column_id,
    subject_id_column_id,
    applicantId,
    companyId,
    jobId,
  });

  // ── Validate config ─────────────────────────────────────────────────────────
  if (!package_column_id || !facility_id_column_id || !position_type_column_id) {
    return {
      success: false,
      error: 'fadv.add_subject: package_column_id, facility_id_column_id, and position_type_column_id are required in config',
    };
  }

  if (!applicantId) {
    return { success: false, error: 'fadv.add_subject: missing applicant_id in payload' };
  }

  // ── Helper: write a message to the output column ────────────────────────────
  async function writeOutput(message: string) {
    if (!output_column_id) return;
    try {
      await supabase
        .from('board_cells')
        .upsert(
          {
            applicant_id:          applicantId,
            column_id:             output_column_id,
            value_text:            message,
            value_number:          null,
            value_date:            null,
            value_status_label_id: null,
            value_file_path:       null,
          },
          { onConflict: 'applicant_id,column_id' }
        );
    } catch (err) {
      console.error('[executeFadvAddSubject] writeOutput error (non-fatal):', err);
    }
  }

  // ── Read input column values from board_cells ───────────────────────────────
  const columnIds = [
    package_column_id,
    facility_id_column_id,
    position_type_column_id,
    first_name_column_id,
    last_name_column_id,
    email_column_id,
  ].filter(Boolean) as string[];

  const { data: cells, error: cellsError } = await supabase
    .from('board_cells')
    .select('column_id, value_text')
    .eq('applicant_id', applicantId)
    .in('column_id', columnIds);

  if (cellsError) {
    console.error('[executeFadvAddSubject] Failed to read cells:', cellsError);
    return { success: false, error: `Failed to read applicant column values: ${cellsError.message}` };
  }

  const cellMap: Record<string, string> = {};
  for (const cell of cells ?? []) {
    cellMap[cell.column_id] = cell.value_text ?? '';
  }

  const packageVal      = (cellMap[package_column_id]       ?? '').trim();
  const facilityIdVal   = (cellMap[facility_id_column_id]   ?? '').trim();
  const positionTypeVal = (cellMap[position_type_column_id] ?? '').trim();
  const firstNameVal    = first_name_column_id ? (cellMap[first_name_column_id] ?? '').trim() : '';
  const lastNameVal     = last_name_column_id  ? (cellMap[last_name_column_id]  ?? '').trim() : '';
  const emailVal        = email_column_id      ? (cellMap[email_column_id]      ?? '').trim() : '';

  // ── Validate field values ───────────────────────────────────────────────────
  const missing: string[] = [];
  if (!packageVal)      missing.push('Package');
  if (!facilityIdVal)   missing.push('Facility ID');
  if (!positionTypeVal) missing.push('Position Type');

  if (missing.length > 0) {
    const msg = `FADV not submitted: missing ${missing.join(', ')}`;
    console.log('[executeFadvAddSubject] Validation failed:', msg);
    await writeOutput(msg);
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorType: 'automation',
      eventType: 'fadv.submission.missing_applicant_fields',
      entityType: 'applicant',
      entityId: applicantId,
      summary: msg,
      data: { applicant_id: applicantId, missing_fields: missing },
    });
    // Graceful skip — automation run is still marked success
    return { success: true };
  }

  // ── Idempotency: skip if already successfully submitted ─────────────────────
  const { data: existing } = await supabase
    .from('integration_submissions')
    .select('id')
    .eq('applicant_id', applicantId)
    .eq('provider', 'fadv')
    .eq('status', 'success')
    .maybeSingle();

  if (existing) {
    const msg = 'FADV already submitted ✅';
    console.log('[executeFadvAddSubject] Skipping — already submitted:', existing.id);
    await writeOutput(msg);
    return { success: true };
  }

  // ── Resolve board_id (best-effort; nullable in table) ───────────────────────
  const { data: board } = await supabase
    .from('boards')
    .select('id')
    .eq('company_id', companyId)
    .eq('job_id', jobId)
    .maybeSingle();

  // ── Enqueue submission ──────────────────────────────────────────────────────
  const { data: submission, error: insertError } = await supabase
    .from('integration_submissions')
    .insert({
      company_id:      companyId,
      applicant_id:    applicantId,
      job_id:          jobId,
      board_id:        board?.id ?? null,
      provider:        'fadv',
      status:          'queued',
      input_snapshot: {
        package:       packageVal,
        facility_id:   facilityIdVal,
        position_type: positionTypeVal,
        ...(firstNameVal && { first_name: firstNameVal }),
        ...(lastNameVal  && { last_name:  lastNameVal  }),
        ...(emailVal     && { email:      emailVal     }),
      },
      output_column_id:     output_column_id     ?? null,
      subject_id_column_id: subject_id_column_id ?? null,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[executeFadvAddSubject] Failed to create submission record:', insertError);
    return { success: false, error: `Failed to queue FADV submission: ${insertError.message}` };
  }

  // ── Write queued status to output column ────────────────────────────────────
  await writeOutput('FADV submission queued...');

  // ── Log activity event ──────────────────────────────────────────────────────
  await logActivityEvent(supabase, {
    companyId,
    jobId,
    actorType: 'automation',
    eventType: 'fadv.submission.queued',
    entityType: 'applicant',
    entityId: applicantId,
    summary: 'FADV submission queued for background processing',
    data: {
      applicant_id:  applicantId,
      submission_id: submission.id,
      package:       packageVal,
      facility_id:   facilityIdVal,
      position_type: positionTypeVal,
    },
  });

  console.log('[executeFadvAddSubject] ✓ Queued submission:', submission.id, {
    applicantId,
    packageVal,
    facilityIdVal,
    positionTypeVal,
    firstNameVal,
    lastNameVal,
    emailVal,
  });

  return { success: true };
}

/**
 * Action: safety_trainer.submit
 *
 * Reads three board columns (driver FedEx ID, start date, completion date)
 * for the applicant, then enqueues a background Safety Trainer Hub submission
 * by inserting an integration_submissions row with status = 'queued'.
 * The Vercel cron job at /api/fadv/process-queue picks it up.
 *
 * Config:
 *   driver_fedex_id_column_id   — text column with driver's FedEx ID
 *   start_date_column_id        — date/text column for Stage 1 start date
 *   completion_date_column_id   — date/text column for Stage 1 completion date
 *   output_column_id            — text column where status messages are written
 */
async function executeSafetyTrainerSubmit(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const {
    driver_fedex_id_column_id,
    start_date_column_id,
    completion_date_column_id,
    contract_number_column_id,
    output_column_id,
  } = config;

  const applicantId: string | undefined = payload.applicant_id || payload.subject_id;

  console.log('[executeSafetyTrainerSubmit] Starting:', {
    driver_fedex_id_column_id,
    start_date_column_id,
    completion_date_column_id,
    contract_number_column_id,
    output_column_id,
    applicantId,
    companyId,
    jobId,
  });

  // ── Validate config ─────────────────────────────────────────────────────────
  if (!driver_fedex_id_column_id || !start_date_column_id || !completion_date_column_id || !contract_number_column_id) {
    return {
      success: false,
      error: 'safety_trainer.submit: driver_fedex_id_column_id, start_date_column_id, completion_date_column_id, and contract_number_column_id are required in config',
    };
  }

  if (!applicantId) {
    return { success: false, error: 'safety_trainer.submit: missing applicant_id in payload' };
  }

  // ── Helper: write a message to the output column ─────────────────────────
  async function writeOutput(message: string) {
    if (!output_column_id) return;
    try {
      await supabase
        .from('board_cells')
        .upsert(
          {
            applicant_id:          applicantId,
            column_id:             output_column_id,
            value_text:            message,
            value_number:          null,
            value_date:            null,
            value_status_label_id: null,
            value_file_path:       null,
          },
          { onConflict: 'applicant_id,column_id' }
        );
    } catch (err) {
      console.error('[executeSafetyTrainerSubmit] writeOutput error (non-fatal):', err);
    }
  }

  // ── Read input column values from board_cells ──────────────────────────────
  const columnIds = [
    driver_fedex_id_column_id,
    start_date_column_id,
    completion_date_column_id,
    contract_number_column_id,
  ].filter(Boolean) as string[];

  const { data: cells, error: cellsError } = await supabase
    .from('board_cells')
    .select('column_id, value_text, value_date')
    .eq('applicant_id', applicantId)
    .in('column_id', columnIds);

  if (cellsError) {
    console.error('[executeSafetyTrainerSubmit] Failed to read cells:', cellsError);
    return { success: false, error: `Failed to read applicant column values: ${cellsError.message}` };
  }

  const cellMap: Record<string, string> = {};
  for (const cell of cells ?? []) {
    // Prefer value_text; fall back to value_date for date columns
    cellMap[cell.column_id] = (cell.value_text ?? cell.value_date ?? '');
  }

  const driverFedexIdVal  = (cellMap[driver_fedex_id_column_id]   ?? '').trim();
  const startDateVal      = (cellMap[start_date_column_id]         ?? '').trim();
  const completionDateVal = (cellMap[completion_date_column_id]    ?? '').trim();
  const contractNumberVal = (cellMap[contract_number_column_id]    ?? '').trim();

  // ── Validate field values ───────────────────────────────────────────────────
  const missing: string[] = [];
  if (!driverFedexIdVal)  missing.push('Driver FedEx ID');
  if (!startDateVal)      missing.push('Start Date');
  if (!completionDateVal) missing.push('Completion Date');
  if (!contractNumberVal) missing.push('Contract Number');

  if (missing.length > 0) {
    const msg = `Safety Trainer not submitted: missing ${missing.join(', ')}`;
    console.log('[executeSafetyTrainerSubmit] Validation failed:', msg);
    await writeOutput(msg);
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorType: 'automation',
      eventType: 'safety_trainer.submission.missing_applicant_fields',
      entityType: 'applicant',
      entityId: applicantId,
      summary: msg,
      data: { applicant_id: applicantId, missing_fields: missing },
    });
    return { success: true };
  }

  // ── Idempotency: skip if already successfully submitted ─────────────────────
  const { data: existing } = await supabase
    .from('integration_submissions')
    .select('id')
    .eq('applicant_id', applicantId)
    .eq('provider', 'safety_trainer')
    .eq('status', 'success')
    .maybeSingle();

  if (existing) {
    const msg = 'Safety Trainer already submitted ✅';
    console.log('[executeSafetyTrainerSubmit] Skipping — already submitted:', existing.id);
    await writeOutput(msg);
    return { success: true };
  }

  // ── Resolve board_id (best-effort; nullable in table) ───────────────────────
  const { data: board } = await supabase
    .from('boards')
    .select('id')
    .eq('company_id', companyId)
    .eq('job_id', jobId)
    .maybeSingle();

  // ── Enqueue submission ──────────────────────────────────────────────────────
  const { data: submission, error: insertError } = await supabase
    .from('integration_submissions')
    .insert({
      company_id:      companyId,
      applicant_id:    applicantId,
      job_id:          jobId,
      board_id:        board?.id ?? null,
      provider:        'safety_trainer',
      status:          'queued',
      input_snapshot: {
        driver_fedex_id:  driverFedexIdVal,
        start_date:       startDateVal,
        completion_date:  completionDateVal,
        contract_number:  contractNumberVal,
      },
      output_column_id: output_column_id ?? null,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[executeSafetyTrainerSubmit] Failed to create submission record:', insertError);
    return { success: false, error: `Failed to queue Safety Trainer submission: ${insertError.message}` };
  }

  await writeOutput('Safety Trainer submission queued...');

  await logActivityEvent(supabase, {
    companyId,
    jobId,
    actorType: 'automation',
    eventType: 'safety_trainer.submission.queued',
    entityType: 'applicant',
    entityId: applicantId,
    summary: 'Safety Trainer submission queued for background processing',
    data: {
      applicant_id:    applicantId,
      submission_id:   submission.id,
      driver_fedex_id: driverFedexIdVal,
      start_date:      startDateVal,
      completion_date: completionDateVal,
    },
  });

  console.log('[executeSafetyTrainerSubmit] ✓ Queued submission:', submission.id, {
    applicantId,
    driverFedexIdVal,
    startDateVal,
    completionDateVal,
  });

  return { success: true };
}

/**
 * Action: lms.send_training_link
 *
 * Creates an LMS enrollment for the applicant (idempotent — skips if already enrolled)
 * and sends them an email containing their unique magic-link training URL via the
 * company's connected Gmail account.
 *
 * Config:
 *   course_id        — UUID of the lms_courses row (must be published)
 *   output_column_id — text column where status messages are written (optional)
 *
 * The learner portal URL is: /learn/[token]
 */
async function executeLmsSendTrainingLink(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const {
    course_id,
    output_column_id,
    status_column_id,
    link_sent_label_id,
    in_progress_label_id,
    passed_label_id,
    failed_label_id,
    custom_subject,
    custom_message,
  } = config;
  const applicantId: string | undefined = payload.applicant_id || payload.subject_id;

  console.log('[executeLmsSendTrainingLink] Starting:', { course_id, output_column_id, applicantId, companyId });

  if (!course_id) {
    return { success: false, error: 'lms.send_training_link: course_id is required in config' };
  }
  if (!applicantId) {
    return { success: false, error: 'lms.send_training_link: missing applicant_id in payload' };
  }

  async function writeOutput(message: string) {
    if (!output_column_id) return;
    try {
      await supabase.from('board_cells').upsert(
        {
          applicant_id:          applicantId,
          column_id:             output_column_id,
          value_text:            message,
          value_number:          null,
          value_date:            null,
          value_status_label_id: null,
          value_file_path:       null,
        },
        { onConflict: 'applicant_id,column_id' }
      );
    } catch (err) {
      console.error('[executeLmsSendTrainingLink] writeOutput error (non-fatal):', err);
    }
  }

  // ── Verify course exists and is published ───────────────────────────────────
  const { data: course, error: courseError } = await supabase
    .from('lms_courses')
    .select('id, name, company_id')
    .eq('id', course_id)
    .eq('is_published', true)
    .maybeSingle();

  if (courseError || !course) {
    const msg = 'Training link not sent: course not found or not published';
    await writeOutput(msg);
    return { success: false, error: msg };
  }

  if (course.company_id !== companyId) {
    return { success: false, error: 'lms.send_training_link: course does not belong to this company' };
  }

  // ── Fetch applicant info (name + email + portal_token) ──────────────────────
  const { data: applicant, error: applicantError } = await supabase
    .from('applicants')
    .select('id, full_name, email, portal_token')
    .eq('id', applicantId)
    .maybeSingle();

  if (applicantError || !applicant) {
    return { success: false, error: `lms.send_training_link: applicant not found (${applicantId})` };
  }

  // Resolve email: applicants.email → configured email_column_id → auto-detect any email-type board cell
  let resolvedEmail = applicant.email ?? null;
  if (!resolvedEmail && config.email_column_id) {
    // Use the explicitly configured column
    const { data: configuredCell } = await supabase
      .from('board_cells')
      .select('value_text')
      .eq('applicant_id', applicantId)
      .eq('column_id', config.email_column_id)
      .maybeSingle();
    resolvedEmail = configuredCell?.value_text ?? null;
    if (resolvedEmail) {
      console.log('[executeLmsSendTrainingLink] Resolved email from configured column:', config.email_column_id);
    }
  }
  if (!resolvedEmail) {
    // Auto-detect: first board cell with an email-type column on this job
    const { data: emailCell } = await supabase
      .from('board_cells')
      .select('value_text, board_columns!inner(type, board_id, boards!inner(job_id))')
      .eq('applicant_id', applicantId)
      .eq('board_columns.type', 'email')
      .eq('board_columns.boards.job_id', jobId)
      .not('value_text', 'is', null)
      .limit(1)
      .maybeSingle();
    resolvedEmail = emailCell?.value_text ?? null;
    if (resolvedEmail) {
      console.log('[executeLmsSendTrainingLink] Resolved email via auto-detect board cell');
    }
  }

  if (!resolvedEmail) {
    const msg = `Training link not sent: ${applicant.full_name ?? 'Applicant'} has no email address on file`;
    console.warn('[executeLmsSendTrainingLink] Applicant has no email:', applicantId);
    await writeOutput(msg);
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorType: 'automation',
      eventType: 'automation.run.warning',
      entityType: 'applicant',
      entityId: applicantId,
      summary: msg,
      data: { applicant_id: applicantId, applicant_name: applicant.full_name, course_id, error: 'No email address' },
    });
    return { success: false, error: msg };
  }

  // ── Idempotency: skip if already enrolled ───────────────────────────────────
  const { data: existing } = await supabase
    .from('lms_enrollments')
    .select('id, token')
    .eq('applicant_id', applicantId)
    .eq('course_id', course_id)
    .maybeSingle();

  let token: string;

  if (existing) {
    console.log('[executeLmsSendTrainingLink] Already enrolled:', existing.id, '— resending link');
    token = existing.token;
    // Update board refs in case the automation config changed
    if (output_column_id || status_column_id) {
      await supabase.from('lms_enrollments').update({
        ...(output_column_id   && { output_column_id }),
        ...(status_column_id   && { status_column_id }),
        ...(link_sent_label_id && { link_sent_label_id }),
        ...(in_progress_label_id && { in_progress_label_id }),
        ...(passed_label_id    && { passed_label_id }),
        ...(failed_label_id    && { failed_label_id }),
      }).eq('id', existing.id);
    }
  } else {
    // ── Create enrollment with board column refs ─────────────────────────────
    const { data: enrollment, error: enrollError } = await supabase
      .from('lms_enrollments')
      .insert({
        applicant_id: applicantId,
        course_id,
        status: 'enrolled',
        ...(output_column_id     && { output_column_id }),
        ...(status_column_id     && { status_column_id }),
        ...(link_sent_label_id   && { link_sent_label_id }),
        ...(in_progress_label_id && { in_progress_label_id }),
        ...(passed_label_id      && { passed_label_id }),
        ...(failed_label_id      && { failed_label_id }),
      })
      .select('id, token')
      .single();

    if (enrollError || !enrollment) {
      console.error('[executeLmsSendTrainingLink] Failed to create enrollment:', enrollError);
      return { success: false, error: `Failed to create LMS enrollment: ${enrollError?.message}` };
    }

    token = enrollment.token;
    console.log('[executeLmsSendTrainingLink] Created enrollment:', enrollment.id, 'token:', token);
  }

  // ── Set "Link Sent" status label on the board immediately ───────────────────
  if (status_column_id && link_sent_label_id) {
    try {
      await supabase.from('board_cells').upsert(
        { applicant_id: applicantId, column_id: status_column_id, value_status_label_id: link_sent_label_id,
          value_text: null, value_number: null, value_date: null, value_file_path: null },
        { onConflict: 'applicant_id,column_id' }
      );
    } catch (err) {
      console.error('[executeLmsSendTrainingLink] Failed to set link_sent status label (non-fatal):', err);
    }
  }

  // ── Send email via company Gmail ────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.routeflex.com';
  const trainingUrl = `${appUrl}/learn/${token}`;

  const { getGmailClientForCompany, sendEmail, buildTrainingLinkEmail } = await import('@/lib/gmail-send');
  const gmail = await getGmailClientForCompany(supabase, companyId);

  if (!gmail) {
    const msg = `Training link not sent: no Gmail account connected. Go to Settings → Integrations to connect Gmail.`;
    console.warn('[executeLmsSendTrainingLink] No Gmail connection — cannot send email');
    await writeOutput(msg);
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorType: 'automation',
      eventType: 'automation.run.warning',
      entityType: 'applicant',
      entityId: applicantId,
      summary: `Training link not sent for ${applicant.full_name ?? applicantId}: no Gmail account connected`,
      data: { applicant_id: applicantId, applicant_name: applicant.full_name, course_id, training_url: trainingUrl, error: 'Gmail not connected' },
    });
    return { success: false, error: msg };
  }

  const { data: company } = await supabase
    .from('companies')
    .select('name, logo_url')
    .eq('id', companyId)
    .maybeSingle();

  const companyName = company?.name ?? 'Your employer';

  // Prefer board_cells First Name / Last Name over applicants.full_name.
  // applicants created via the board's "Add item" button start with
  // full_name = "New Applicant"; the user fills in name cells without the
  // legacy full_name column being updated (our sync fix covers future saves
  // but not retroactively).
  const { data: applicantNameCells } = await supabase
    .from('board_cells')
    .select('value_text, board_columns!inner(name)')
    .eq('applicant_id', applicantId);

  let cellFirstName = '';
  let cellLastName  = '';
  for (const cell of applicantNameCells ?? []) {
    const cn = (cell as any).board_columns?.name?.toLowerCase().trim() ?? '';
    if (cn === 'first name' || cn === 'firstname') cellFirstName = (cell as any).value_text ?? '';
    if (cn === 'last name'  || cn === 'lastname')  cellLastName  = (cell as any).value_text ?? '';
  }

  const firstName = cellFirstName || applicant.full_name?.split(' ')[0] || 'there';
  const fullName  = [cellFirstName, cellLastName].filter(Boolean).join(' ')
                    || applicant.full_name
                    || 'there';

  // appUrl is already declared above (used for trainingUrl); reuse it here
  const lmsPortalUrl = applicant.portal_token
    ? `${appUrl}/status/${applicant.portal_token}`
    : '';

  // Slugify helper — must match the UI's slugifyColName function
  function slugifyColName(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  // Pre-fetch board column cell values for {{col:slug}} tokens in custom templates
  // slug format: "FedEx ID" → "fedex_id" → token "{{col:fedex_id}}"
  let colSlugValueMap = new Map<string, string>(); // slug → resolved cell value
  if (custom_subject || custom_message) {
    const templateContent = (custom_subject ?? '') + ' ' + (custom_message ?? '');
    const colTokenMatches = [...templateContent.matchAll(/\{\{col:([a-z0-9_]+)\}\}/g)];
    if (colTokenMatches.length > 0) {
      const slugs = [...new Set(colTokenMatches.map((m) => m[1]))];
      // Fetch board columns for this job to build slug → id map
      const { data: boardRow } = await supabase
        .from('boards')
        .select('board_columns(id, name)')
        .eq('job_id', jobId)
        .maybeSingle();
      const boardCols = (boardRow?.board_columns ?? []) as { id: string; name: string }[];
      const slugToColId = new Map(boardCols.map((c) => [slugifyColName(c.name), c.id]));

      const colIds = slugs.map((s) => slugToColId.get(s)).filter(Boolean) as string[];
      if (colIds.length > 0) {
        const { data: cells } = await supabase
          .from('board_cells')
          .select('column_id, value_text')
          .eq('applicant_id', applicantId)
          .in('column_id', colIds);
        const colIdValueMap = new Map(
          (cells ?? []).map((c: { column_id: string; value_text: string | null }) => [c.column_id, c.value_text ?? ''])
        );
        // Keyed by slug for easy substitution
        for (const slug of slugs) {
          const colId = slugToColId.get(slug);
          colSlugValueMap.set(slug, colId ? (colIdValueMap.get(colId) ?? '') : '');
        }
      }
    }
  }

  // Substitute {{variables}} in custom subject/message if provided
  function substituteVars(template: string): string {
    let result = template
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{full_name\}\}/g, fullName)
      .replace(/\{\{company_name\}\}/g, companyName)
      .replace(/\{\{training_link\}\}/g, trainingUrl)
      .replace(/\{\{portal_link\}\}/g, lmsPortalUrl);
    // Column cell values: {{col:slug}}
    for (const [slug, value] of colSlugValueMap) {
      result = result.replace(new RegExp(`\\{\\{col:${slug}\\}\\}`, 'g'), value);
    }
    return result;
  }

  const { subject, body: emailBody } = buildTrainingLinkEmail({
    firstName,
    companyName,
    logoUrl: company?.logo_url,
    trainingUrl,
    customSubject: custom_subject ? substituteVars(custom_subject) : undefined,
    customMessage: custom_message ? substituteVars(custom_message) : undefined,
  });

  const emailResult = await sendEmail(gmail.gmail, {
    to: resolvedEmail,
    subject,
    body: emailBody,
  });

  if (!emailResult.success) {
    const msg = `Training link created but email failed: ${emailResult.error}`;
    console.error('[executeLmsSendTrainingLink] Email send failed:', emailResult.error);
    await writeOutput(msg);
    return { success: false, error: msg };
  }

  const sentMsg = `Training link sent ✅ ${new Date().toLocaleDateString()}`;
  await writeOutput(sentMsg);

  await logActivityEvent(supabase, {
    companyId,
    jobId,
    actorType: 'automation',
    eventType: 'lms.training_link.sent',
    entityType: 'applicant',
    entityId: applicantId,
    summary: `Training link emailed to ${resolvedEmail} for course "${course.name}"`,
    data: {
      applicant_id:  applicantId,
      course_id,
      course_name:   course.name,
      email:         resolvedEmail,
      training_url:  trainingUrl,
      message_id:    emailResult.messageId,
    },
  });

  console.log('[executeLmsSendTrainingLink] ✓ Training link sent to:', resolvedEmail, 'url:', trainingUrl);
  return { success: true };
}

/**
 * Action: portal.send_link
 *
 * Emails the applicant a link to their personal status portal (/status/[token]).
 * The portal_token is persistent and already exists on the applicant row —
 * no enrollment or record creation is needed.
 *
 * Config:
 *   email_column_id — UUID of a board column to use as email source (optional)
 */
async function executePortalSendLink(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const applicantId: string | undefined = payload.applicant_id || payload.subject_id;

  console.log('[executePortalSendLink] Starting:', { applicantId, companyId });

  if (!applicantId) {
    return { success: false, error: 'portal.send_link: missing applicant_id in payload' };
  }

  // ── Fetch applicant (name, email, portal_token) ─────────────────────────────
  const { data: applicant, error: applicantError } = await supabase
    .from('applicants')
    .select('id, full_name, email, portal_token')
    .eq('id', applicantId)
    .maybeSingle();

  if (applicantError || !applicant) {
    return { success: false, error: `portal.send_link: applicant not found (${applicantId})` };
  }

  if (!applicant.portal_token) {
    return { success: false, error: 'portal.send_link: applicant has no portal_token' };
  }

  // ── Resolve email ───────────────────────────────────────────────────────────
  let resolvedEmail = applicant.email ?? null;
  if (!resolvedEmail && config.email_column_id) {
    const { data: configuredCell } = await supabase
      .from('board_cells')
      .select('value_text')
      .eq('applicant_id', applicantId)
      .eq('column_id', config.email_column_id)
      .maybeSingle();
    resolvedEmail = configuredCell?.value_text ?? null;
  }
  if (!resolvedEmail) {
    const { data: emailCell } = await supabase
      .from('board_cells')
      .select('value_text, board_columns!inner(type, board_id, boards!inner(job_id))')
      .eq('applicant_id', applicantId)
      .eq('board_columns.type', 'email')
      .eq('board_columns.boards.job_id', jobId)
      .not('value_text', 'is', null)
      .limit(1)
      .maybeSingle();
    resolvedEmail = emailCell?.value_text ?? null;
  }

  if (!resolvedEmail) {
    const msg = `Status portal link not sent: ${applicant.full_name ?? 'Applicant'} has no email address on file`;
    console.warn('[executePortalSendLink] Applicant has no email:', applicantId);
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorType: 'automation',
      eventType: 'automation.run.warning',
      entityType: 'applicant',
      entityId: applicantId,
      summary: msg,
      data: { applicant_id: applicantId, applicant_name: applicant.full_name, error: 'No email address' },
    });
    return { success: false, error: msg };
  }

  // ── Build portal URL ────────────────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.routeflex.com';
  const portalUrl = `${appUrl}/status/${applicant.portal_token}`;

  // ── Send email via company Gmail ────────────────────────────────────────────
  const { getGmailClientForCompany, sendEmail, buildPortalLinkEmail } = await import('@/lib/gmail-send');
  const gmail = await getGmailClientForCompany(supabase, companyId);

  if (!gmail) {
    const msg = 'Status portal link not sent: no Gmail account connected. Go to Settings → Integrations to connect Gmail.';
    console.warn('[executePortalSendLink] No Gmail connection — cannot send email');
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorType: 'automation',
      eventType: 'automation.run.warning',
      entityType: 'applicant',
      entityId: applicantId,
      summary: `Status portal link not sent for ${applicant.full_name ?? applicantId}: no Gmail account connected`,
      data: { applicant_id: applicantId, applicant_name: applicant.full_name, portal_url: portalUrl, error: 'Gmail not connected' },
    });
    return { success: false, error: msg };
  }

  const { data: company } = await supabase
    .from('companies')
    .select('name, logo_url')
    .eq('id', companyId)
    .maybeSingle();

  const companyName = company?.name ?? 'Your employer';

  // Prefer board_cells First Name / Last Name over applicants.full_name
  const { data: portalNameCells } = await supabase
    .from('board_cells')
    .select('value_text, board_columns!inner(name)')
    .eq('applicant_id', applicantId);

  let portalCellFirstName = '';
  let portalCellLastName  = '';
  for (const cell of portalNameCells ?? []) {
    const cn = (cell as any).board_columns?.name?.toLowerCase().trim() ?? '';
    if (cn === 'first name' || cn === 'firstname') portalCellFirstName = (cell as any).value_text ?? '';
    if (cn === 'last name'  || cn === 'lastname')  portalCellLastName  = (cell as any).value_text ?? '';
  }

  const firstName = portalCellFirstName || applicant.full_name?.split(' ')[0] || 'there';
  const fullName  = [portalCellFirstName, portalCellLastName].filter(Boolean).join(' ')
                    || applicant.full_name
                    || 'there';

  const { custom_subject, custom_message } = config as { custom_subject?: string; custom_message?: string };

  // Slugify helper — must match the UI's slugifyColName function
  function slugifyPortalColName(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  // Pre-fetch board column cell values for {{col:slug}} tokens in custom templates
  let portalColSlugValueMap = new Map<string, string>(); // slug → resolved cell value
  if (custom_subject || custom_message) {
    const templateContent = (custom_subject ?? '') + ' ' + (custom_message ?? '');
    const colTokenMatches = [...templateContent.matchAll(/\{\{col:([a-z0-9_]+)\}\}/g)];
    if (colTokenMatches.length > 0) {
      const slugs = [...new Set(colTokenMatches.map((m) => m[1]))];
      const { data: boardRow } = await supabase
        .from('boards')
        .select('board_columns(id, name)')
        .eq('job_id', jobId)
        .maybeSingle();
      const boardCols = (boardRow?.board_columns ?? []) as { id: string; name: string }[];
      const slugToColId = new Map(boardCols.map((c) => [slugifyPortalColName(c.name), c.id]));

      const colIds = slugs.map((s) => slugToColId.get(s)).filter(Boolean) as string[];
      if (colIds.length > 0) {
        const { data: cells } = await supabase
          .from('board_cells')
          .select('column_id, value_text')
          .eq('applicant_id', applicantId)
          .in('column_id', colIds);
        const colIdValueMap = new Map(
          (cells ?? []).map((c: { column_id: string; value_text: string | null }) => [c.column_id, c.value_text ?? ''])
        );
        for (const slug of slugs) {
          const colId = slugToColId.get(slug);
          portalColSlugValueMap.set(slug, colId ? (colIdValueMap.get(colId) ?? '') : '');
        }
      }
    }
  }

  function substitutePortalVars(template: string): string {
    let result = template
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{full_name\}\}/g, fullName)
      .replace(/\{\{company_name\}\}/g, companyName)
      .replace(/\{\{portal_link\}\}/g, portalUrl);
    // Column cell values: {{col:slug}}
    for (const [slug, value] of portalColSlugValueMap) {
      result = result.replace(new RegExp(`\\{\\{col:${slug}\\}\\}`, 'g'), value);
    }
    return result;
  }

  const { subject, body: emailBody } = buildPortalLinkEmail({
    firstName,
    companyName,
    logoUrl: company?.logo_url,
    portalUrl,
    customSubject: custom_subject ? substitutePortalVars(custom_subject) : undefined,
    customMessage: custom_message ? substitutePortalVars(custom_message) : undefined,
  });

  const emailResult = await sendEmail(gmail.gmail, {
    to: resolvedEmail,
    subject,
    body: emailBody,
  });

  if (!emailResult.success) {
    const msg = `Status portal link email failed: ${emailResult.error}`;
    console.error('[executePortalSendLink] Email send failed:', emailResult.error);
    return { success: false, error: msg };
  }

  await logActivityEvent(supabase, {
    companyId,
    jobId,
    actorType: 'automation',
    eventType: 'portal.link_sent',
    entityType: 'applicant',
    entityId: applicantId,
    summary: `Status portal link emailed to ${resolvedEmail}`,
    data: {
      applicant_id: applicantId,
      email: resolvedEmail,
      portal_url: portalUrl,
      message_id: emailResult.messageId,
    },
  });

  console.log('[executePortalSendLink] ✓ Portal link sent to:', resolvedEmail, 'url:', portalUrl);
  return { success: true };
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
      const filterMatches = await matchesFilter(supabase, automation.filter, run.payload);
      console.log('[debugAutomationRun] Filter result:', filterMatches ? '✓ MATCH' : '✗ NO MATCH');
    }
  }

  console.log('[debugAutomationRun] ========================================');
}

// ============================================================================
// Realtime broadcast helper for ai.score_resume
// Sends cell data to subscribed board clients via Supabase HTTP broadcast API.
// This bypasses RLS (which blocks postgres_changes for complex JOIN policies).
// Non-fatal: clients fall back to refresh if the fetch fails.
// ============================================================================
async function broadcastCell(jobId: string, cellData: Record<string, unknown>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  try {
    const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey':         serviceKey,
      },
      body: JSON.stringify({
        messages: [{
          topic:   `realtime:board-job-${jobId}`,
          event:   'cell-upserted',
          payload:  cellData,
        }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      console.error(`[broadcastCell] HTTP ${res.status} from Realtime API:`, body);
    } else {
      console.log(`[broadcastCell] OK — jobId=${jobId} col=${String(cellData.column_id)}`);
    }
  } catch (e) {
    console.error('[broadcastCell] non-fatal fetch error:', e);
  }
}

// ============================================================================
// Action: ai.score_resume
// Config: {
//   file_column_id?: string,     — board file column with resume (optional)
//   score_column_id: string,     — text column for score output
//   feedback_column_id: string,  — text column for feedback output
//   criteria: string,            — user-provided scoring criteria
// }
// ============================================================================
async function executeAiScoreResume(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const {
    file_column_id,
    score_column_id,
    feedback_column_id,
    criteria,
  } = config;

  const applicantId: string | undefined = payload.applicant_id || payload.subject_id;

  console.log('[executeAiScoreResume] Starting:', {
    file_column_id,
    score_column_id,
    feedback_column_id,
    criteriaLength: criteria?.length,
    applicantId,
    companyId,
    jobId,
  });

  // ── Validate config ─────────────────────────────────────────────────────────
  if (!score_column_id || !feedback_column_id) {
    return { success: false, error: 'ai.score_resume: score_column_id and feedback_column_id are required' };
  }
  if (!criteria?.trim()) {
    return { success: false, error: 'ai.score_resume: criteria is required' };
  }
  if (!applicantId) {
    return { success: false, error: 'ai.score_resume: missing applicant_id in payload' };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { success: false, error: 'ai.score_resume: ANTHROPIC_API_KEY not configured' };
  }

  // ── Helpers: write score (number) and feedback (text) to board cells ─────────
  async function writeScoreCell(score: number | null) {
    const cellData = {
      applicant_id:          applicantId,
      column_id:             score_column_id,
      value_text:            null,
      value_number:          score,
      value_date:            null,
      value_bool:            null,
      value_status_label_id: null,
      value_file_path:       null,
    };
    try {
      await supabase
        .from('board_cells')
        .upsert(cellData, { onConflict: 'applicant_id,column_id' });
    } catch (err) {
      console.error('[executeAiScoreResume] writeScoreCell error (non-fatal):', err);
    }
    // Broadcast to board clients regardless of postgres_changes RLS
    await broadcastCell(jobId, cellData);
  }

  async function writeFeedbackCell(text: string) {
    const cellData = {
      applicant_id:          applicantId,
      column_id:             feedback_column_id,
      value_text:            text,
      value_number:          null,
      value_date:            null,
      value_bool:            null,
      value_status_label_id: null,
      value_file_path:       null,
    };
    try {
      await supabase
        .from('board_cells')
        .upsert(cellData, { onConflict: 'applicant_id,column_id' });
    } catch (err) {
      console.error('[executeAiScoreResume] writeFeedbackCell error (non-fatal):', err);
    }
    // Broadcast to board clients regardless of postgres_changes RLS
    await broadcastCell(jobId, cellData);
  }

  // ── Resolve resume file ─────────────────────────────────────────────────────
  let filePath: string | null = null;
  let fileBucket: string = 'files';

  // Path A: read from the configured file column
  if (file_column_id) {
    const { data: cell } = await supabase
      .from('board_cells')
      .select('value_file_path')
      .eq('applicant_id', applicantId)
      .eq('column_id', file_column_id)
      .maybeSingle();

    if (cell?.value_file_path) {
      filePath = cell.value_file_path;
      fileBucket = 'files';
    }
  }

  // Path B: fall back to applicants.resume_path
  if (!filePath) {
    const { data: applicantRow } = await supabase
      .from('applicants')
      .select('resume_path')
      .eq('id', applicantId)
      .maybeSingle();

    if (applicantRow?.resume_path) {
      filePath = applicantRow.resume_path;
      fileBucket = 'resumes';
    }
  }

  // ── Download the file ───────────────────────────────────────────────────────
  let pdfBase64: string | null = null;
  let docxText: string | null = null;
  let fileSkipReason: string | null = null;

  if (filePath) {
    const lowerPath = filePath.toLowerCase();
    const isPdf  = lowerPath.endsWith('.pdf');
    const isDocx = lowerPath.endsWith('.docx') || lowerPath.endsWith('.doc');

    if (isPdf) {
      const { data: blob, error: dlError } = await supabase.storage
        .from(fileBucket)
        .download(filePath);

      if (dlError || !blob) {
        fileSkipReason = `Could not download resume file: ${dlError?.message ?? 'unknown error'}. Scoring based on application form data only.`;
        console.error('[executeAiScoreResume] PDF download failed:', dlError);
      } else {
        const arrayBuffer = await blob.arrayBuffer();
        pdfBase64 = Buffer.from(arrayBuffer).toString('base64');
        console.log('[executeAiScoreResume] PDF downloaded, base64 length:', pdfBase64.length);
      }
    } else if (isDocx) {
      const { data: blob, error: dlError } = await supabase.storage
        .from(fileBucket)
        .download(filePath);

      if (dlError || !blob) {
        fileSkipReason = `Could not download resume file: ${dlError?.message ?? 'unknown error'}. Scoring based on application form data only.`;
        console.error('[executeAiScoreResume] DOCX download failed:', dlError);
      } else {
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
          docxText = result.value.trim() || null;
          console.log('[executeAiScoreResume] DOCX text extracted, length:', docxText?.length ?? 0);
        } catch (mammothErr: any) {
          fileSkipReason = `Could not read Word document: ${mammothErr?.message ?? 'extraction error'}. Scoring based on application form data only.`;
          console.error('[executeAiScoreResume] Mammoth extraction failed:', mammothErr);
        }
      }
    } else {
      fileSkipReason = `File format not supported (only PDF and DOCX are readable). Scoring based on application form data only.`;
      console.log('[executeAiScoreResume] Unsupported file type, skipping:', filePath);
    }
  }

  // ── Gather form field responses ─────────────────────────────────────────────
  const { data: fieldValues } = await supabase
    .from('applicant_field_values')
    .select(`
      value_text,
      value_number,
      value_bool,
      value_date,
      job_application_fields!inner (
        key,
        label,
        type
      )
    `)
    .eq('applicant_id', applicantId);

  const formDataLines = (fieldValues ?? [])
    .filter((fv: any) => fv.value_text || fv.value_number != null || fv.value_bool != null || fv.value_date)
    .map((fv: any) => {
      const field = fv.job_application_fields;
      const value =
        fv.value_text ??
        fv.value_number?.toString() ??
        (fv.value_bool != null ? (fv.value_bool ? 'Yes' : 'No') : null) ??
        fv.value_date ??
        '';
      return `${field.label}: ${value}`;
    });

  const formDataText = formDataLines.join('\n');

  // ── Fetch applicant basic info ──────────────────────────────────────────────
  const { data: applicant } = await supabase
    .from('applicants')
    .select('full_name, email, phone')
    .eq('id', applicantId)
    .maybeSingle();

  // ── Guard: nothing to score ─────────────────────────────────────────────────
  if (!pdfBase64 && !docxText && !formDataText.trim()) {
    const msg = 'AI scoring skipped: no resume or application form data available for this applicant.';
    console.log('[executeAiScoreResume]', msg);
    await writeFeedbackCell(msg);
    return { success: true };
  }

  // ── Build Claude API content blocks ─────────────────────────────────────────
  const contentBlocks: any[] = [];

  if (pdfBase64) {
    contentBlocks.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: pdfBase64,
      },
    });
  }

  if (docxText) {
    contentBlocks.push({
      type: 'text',
      text: `## Resume (extracted from Word document)\n\n${docxText}`,
    });
  }

  // Applicant info + form responses
  let contextText = '';
  if (applicant) {
    contextText += `## Applicant\nName: ${applicant.full_name ?? 'Unknown'}\nEmail: ${applicant.email ?? 'N/A'}\nPhone: ${applicant.phone ?? 'N/A'}\n\n`;
  }
  if (formDataText.trim()) {
    contextText += `## Application Form Responses\n\n${formDataText}\n\n`;
  }
  if (contextText) {
    contentBlocks.push({ type: 'text', text: contextText });
  }

  // Scoring instruction — score must be a plain JSON number
  let instruction = `Score this applicant based on the following criteria. Return ONLY valid JSON with exactly two keys:\n`;
  instruction += `- "score": a NUMBER (not a string). Your scoring criteria will specify the scale (e.g. 1-10). Return only the number.\n`;
  instruction += `- "feedback": a string with detailed feedback explaining the score, noting strengths and weaknesses (2-4 sentences).\n\n`;
  instruction += `## Scoring Criteria\n\n${criteria}\n`;

  if (!pdfBase64 && !docxText && fileSkipReason) {
    instruction += `\nNote: ${fileSkipReason}\n`;
  } else if (!pdfBase64 && !docxText) {
    instruction += `\nNote: No resume was provided. Score based only on the application form responses above.\n`;
  }

  instruction += `\nReturn ONLY the JSON object. No markdown fences, no explanation outside the JSON.`;
  contentBlocks.push({ type: 'text', text: instruction });

  // ── Call Claude API ─────────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Write "Scoring..." to feedback column while waiting (score column is number — can't write text)
  await writeFeedbackCell('Scoring...');

  let message;
  try {
    message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: 'You are an expert recruiting evaluator. You assess job applicants objectively based on the provided criteria. Always respond with valid JSON only.',
      messages: [
        {
          role: 'user',
          content: contentBlocks,
        },
      ],
    });
  } catch (apiError: any) {
    const errorMsg = `AI scoring failed: ${apiError.message ?? 'Anthropic API error'}`;
    console.error('[executeAiScoreResume] API error:', apiError);
    await writeFeedbackCell(errorMsg);
    return { success: false, error: errorMsg };
  }

  // ── Parse response ──────────────────────────────────────────────────────────
  const responseText = (message.content.find((b) => b.type === 'text') as { type: 'text'; text: string } | undefined)?.text ?? '';

  let scoreNum: number | null = null;
  let feedback = '';

  try {
    // Strip markdown code fences if Claude adds them despite instructions
    const cleaned = responseText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    const rawScore = parsed.score;
    scoreNum = typeof rawScore === 'number' ? rawScore : parseFloat(String(rawScore));
    if (isNaN(scoreNum)) scoreNum = null;
    feedback = String(parsed.feedback ?? '');
  } catch {
    // If JSON parse fails, use the raw response as feedback
    console.warn('[executeAiScoreResume] JSON parse failed, using raw response');
    feedback = responseText;
  }

  // ── Write results to board cells ────────────────────────────────────────────
  await writeScoreCell(scoreNum);
  await writeFeedbackCell(feedback);

  console.log('[executeAiScoreResume] Scored applicant:', {
    applicantId,
    score: scoreNum,
    feedbackLength: feedback.length,
    model: message.model,
    inputTokens: message.usage?.input_tokens,
    outputTokens: message.usage?.output_tokens,
  });

  return { success: true };
}
