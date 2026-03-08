import { SupabaseClient } from '@supabase/supabase-js';
import { ActionResult } from './types';
import { logActivityEvent } from '@/lib/activity/logActivityEvent';

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
 */
export async function executeFadvAddSubject(
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
    const msg = 'FADV already submitted';
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

  console.log('[executeFadvAddSubject] Queued submission:', submission.id, {
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
 * Action: fadv.approve_order
 *
 * Reads the FADV Profile ID from a board column, then enqueues a background
 * FADV "approve order" submission. The queue processor searches for the subject
 * by Profile ID and clicks "Review & Place Order" in the FADV portal.
 *
 * Config: { subject_id_column_id: uuid, output_column_id: uuid, status_column_id?: uuid }
 */
export async function executeFadvApproveOrder(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const { subject_id_column_id, output_column_id, status_column_id, queued_label_id, approved_label_id, error_label_id } = config;

  const applicantId: string | undefined =
    payload.applicant_id || payload.subject_id;

  console.log('[executeFadvApproveOrder] Starting:', {
    subject_id_column_id,
    output_column_id,
    status_column_id,
    applicantId,
    companyId,
    jobId,
  });

  // ── Validate config ─────────────────────────────────────────────────────────
  if (!subject_id_column_id) {
    return {
      success: false,
      error:
        'fadv.approve_order: subject_id_column_id is required (column containing FADV Profile ID)',
    };
  }

  if (!applicantId) {
    return {
      success: false,
      error: 'fadv.approve_order: missing applicant_id in payload',
    };
  }

  // ── Helper: write text to a board column ────────────────────────────────────
  async function writeCell(columnId: string | undefined, message: string) {
    if (!columnId) return;
    try {
      await supabase
        .from('board_cells')
        .upsert(
          {
            applicant_id: applicantId,
            column_id: columnId,
            value_text: message,
            value_number: null,
            value_date: null,
            value_status_label_id: null,
            value_file_path: null,
          },
          { onConflict: 'applicant_id,column_id' }
        );
    } catch (err) {
      console.error('[executeFadvApproveOrder] writeCell error (non-fatal):', err);
    }
  }

  // ── Helper: write a status label ID to the status column ────────────────────
  async function writeStatusLabel(labelId: string | undefined) {
    if (!status_column_id || !labelId) return;
    try {
      await supabase
        .from('board_cells')
        .upsert(
          {
            applicant_id: applicantId,
            column_id: status_column_id,
            value_status_label_id: labelId,
            value_text: null,
            value_number: null,
            value_date: null,
            value_file_path: null,
          },
          { onConflict: 'applicant_id,column_id' }
        );
    } catch (err) {
      console.error('[executeFadvApproveOrder] writeStatusLabel error (non-fatal):', err);
    }
  }

  const writeOutput = (msg: string) => writeCell(output_column_id, msg);

  // ── Read Profile ID from the board column ───────────────────────────────────
  const { data: cell, error: cellError } = await supabase
    .from('board_cells')
    .select('value_text')
    .eq('applicant_id', applicantId)
    .eq('column_id', subject_id_column_id)
    .maybeSingle();

  if (cellError) {
    console.error(
      '[executeFadvApproveOrder] Failed to read Profile ID cell:',
      cellError
    );
    return {
      success: false,
      error: `Failed to read Profile ID column: ${cellError.message}`,
    };
  }

  const profileId = (cell?.value_text ?? '').trim();

  if (!profileId) {
    const msg = 'FADV approve skipped — Profile ID column is empty';
    console.log('[executeFadvApproveOrder]', msg);
    await writeOutput(msg);
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorType: 'automation',
      eventType: 'fadv.approve.missing_profile_id',
      entityType: 'applicant',
      entityId: applicantId,
      summary: msg,
      data: { applicant_id: applicantId },
    });
    return { success: true };
  }

  // ── Idempotency: skip if already successfully approved ──────────────────────
  const { data: existing } = await supabase
    .from('integration_submissions')
    .select('id')
    .eq('applicant_id', applicantId)
    .eq('provider', 'fadv_approve')
    .eq('status', 'success')
    .maybeSingle();

  if (existing) {
    const msg = 'FADV order already approved';
    console.log('[executeFadvApproveOrder] Skipping:', existing.id);
    await writeOutput(msg);
    return { success: true };
  }

  // ── Resolve board_id (best-effort; nullable) ────────────────────────────────
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
      company_id: companyId,
      applicant_id: applicantId,
      job_id: jobId,
      board_id: board?.id ?? null,
      provider: 'fadv_approve',
      status: 'queued',
      // Store status column + label IDs in input_snapshot so the queue
      // processor can write status updates without an extra DB column.
      input_snapshot: {
        profile_id: profileId,
        ...(status_column_id   ? { status_column_id }   : {}),
        ...(queued_label_id    ? { queued_label_id }    : {}),
        ...(approved_label_id  ? { approved_label_id }  : {}),
        ...(error_label_id     ? { error_label_id }     : {}),
      },
      output_column_id: output_column_id ?? null,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error(
      '[executeFadvApproveOrder] Failed to create submission record:',
      insertError
    );
    return {
      success: false,
      error: `Failed to queue FADV approval: ${insertError.message}`,
    };
  }

  await writeOutput('FADV approval queued...');
  await writeStatusLabel(queued_label_id);

  await logActivityEvent(supabase, {
    companyId,
    jobId,
    actorType: 'automation',
    eventType: 'fadv.approve.queued',
    entityType: 'applicant',
    entityId: applicantId,
    summary: `FADV order approval queued for Profile ID: ${profileId}`,
    data: {
      applicant_id: applicantId,
      submission_id: submission.id,
      profile_id: profileId,
    },
  });

  console.log('[executeFadvApproveOrder] Queued submission:', submission.id, {
    applicantId,
    profileId,
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
export async function executeSafetyTrainerSubmit(
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
    const msg = 'Safety Trainer already submitted';
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

  console.log('[executeSafetyTrainerSubmit] Queued submission:', submission.id, {
    applicantId,
    driverFedexIdVal,
    startDateVal,
    completionDateVal,
  });

  return { success: true };
}
