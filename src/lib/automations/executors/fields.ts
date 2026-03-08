import { SupabaseClient } from '@supabase/supabase-js';
import { ActionResult } from './types';
import { logActivityEvent } from '@/lib/activity/logActivityEvent';

/**
 * Action: set_date
 * Config: { column_id: uuid, value: 'today' | 'tomorrow' | ISO date string }
 */
export async function executeSetDate(
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
export async function executeSetNumber(
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
export async function executeIncDec(
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
 * Action: integration.set_field
 * Sets a per-applicant integration field (e.g. FADV package, location).
 *
 * Config:
 *   provider   — "fadv"
 *   field_key  — "package" | "location" | "facility_id" | "position_type"
 *   value      — string value to set (static for MVP)
 */
export async function executeIntegrationSetField(
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

  console.log('[executeIntegrationSetField] Set', `${provider}.${field_key}`, '=', resolvedValue);
  return { success: true };
}
