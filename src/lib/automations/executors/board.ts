import { SupabaseClient } from '@supabase/supabase-js';
import { ActionResult } from './types';

/**
 * Action: move_group
 * Config: { to_group_id: uuid }
 */
export async function executeMoveGroup(
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

  console.log('[executeMoveGroup] Successfully moved applicant:', {
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
  // Dynamic import avoids circular dependency with fireJobAutomation.ts
  try {
    const { fireJobTrigger } = await import('../fireJobAutomation');
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
export async function executeSetStatus(
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
export async function executeChangeStatus(
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

  console.log('[executeChangeStatus] Successfully changed status:', {
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
export async function executeDeleteItem(
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
