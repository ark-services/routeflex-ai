import { SupabaseClient } from '@supabase/supabase-js';
import { logActivityEvent } from '@/lib/activity/logActivityEvent';
import { executeAction, ActionResult } from './executors';

export type { ActionResult };

export interface FireJobTriggerInput {
  companyId: string;
  jobId: string;
  trigger_key: string;
  subject_type: string;
  subject_id: string;
  payload: Record<string, any>;
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

    // Hoist account_id lookup — needed for metering but constant across all automations/actions
    let accountId: string | null = null;
    try {
      const { data: companyRow } = await supabase
        .from('companies')
        .select('account_id')
        .eq('id', companyId)
        .single();
      accountId = companyRow?.account_id ?? null;
    } catch {
      console.error('[fireJobTrigger] Failed to fetch company account_id for metering');
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

      console.log('[fireJobTrigger] Filter matched! Executing actions...');

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
            console.error('[fireJobTrigger] Action failed:', runError);
            break; // Stop on first failure
          }

          actionsSucceeded++;
          actionResults.push({
            action_id: action.id,
            type: action.type,
            status: 'success',
            duration_ms: actionDuration,
          });
          console.log('[fireJobTrigger] Action succeeded');

          // ============================================================
          // METERING: Track successful action execution for quota
          // Uses hoisted accountId (fetched once before the automation loop)
          // ============================================================
          if (accountId) {
            try {
              const { error: meteringError } = await supabase.rpc('record_action_usage', {
                p_account_id: accountId,
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
              });
              if (meteringError) {
                console.error('[fireJobTrigger] Metering RPC error (non-fatal):', meteringError);
              }
            } catch (meteringErr) {
              console.error('[fireJobTrigger] Metering exception (non-fatal):', meteringErr);
            }
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
          console.error('[fireJobTrigger] Action threw error:', err);
          break;
        }
      }

      const totalDuration = Date.now() - runStartTime;

      console.log('[fireJobTrigger] Final run status:', runStatus);
      console.log('[fireJobTrigger] Actions attempted:', actionsAttempted);
      console.log('[fireJobTrigger] Actions succeeded:', actionsSucceeded);
      console.log('[fireJobTrigger] Actions failed:', actionsFailed);
      console.log('[fireJobTrigger] Total duration:', totalDuration, 'ms');

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

    // Skip Gmail trigger config keys — these live in the filter JSON for storage
    // convenience but are NOT filter conditions; they describe how to match the
    // email to an applicant, not whether the automation should run.
    if (['match_column_id', 'sender_contains', 'subject_contains',
         'match_applicant_by', 'body_extract_pattern'].includes(key)) continue;

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
      console.log('[matchesFilter] Additional conditions did not pass');
      return false;
    }
  }

  console.log('[matchesFilter] All filter conditions matched');
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
      `[evaluateCondition] type="${condition.type}" col="${condition.column_id}" value="${condition.value}": ${passes ? 'pass' : 'fail'}`
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
      const passWhenEmpty = type.endsWith('_is_not') || type === 'is_empty' || type === 'text_contains';
      console.warn(
        `[evaluateCondition] No board_cell found for applicant=${applicantId} column=${column_id} — ${passWhenEmpty ? 'passing' : 'failing'} (${type})`
      );
      return passWhenEmpty;
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
      console.log('[debugAutomationRun] Filter result:', filterMatches ? 'MATCH' : 'NO MATCH');
    }
  }

  console.log('[debugAutomationRun] ========================================');
}
