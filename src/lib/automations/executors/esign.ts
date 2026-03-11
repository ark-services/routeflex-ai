import { SupabaseClient } from '@supabase/supabase-js';
import { ActionResult } from './types';
import { getAdobeSignClient, createAgreement } from '@/lib/adobe-sign/client';
import { logActivityEvent } from '@/lib/activity/logActivityEvent';

/**
 * Action: esign.send_agreement
 *
 * Sends a PDF for eSignature via Adobe Sign. Reads field values from
 * board columns (resolved by column name), builds the agreement with
 * merge fields, and tracks it in esign_agreements for webhook callbacks.
 *
 * Config:
 *   template_id        — UUID of the esign_templates row
 *   output_column_id   — text column where status messages are written
 *   status_column_id   — status column to update on completion (stored for webhook)
 *   completed_label_id — status label to set when signed (stored for webhook)
 *   file_column_id     — file column to store signed PDF (stored for webhook)
 */
export async function executeEsignSendAgreement(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const {
    template_id,
    output_column_id,
    status_column_id,
    completed_label_id,
    file_column_id,
  } = config;

  const applicantId: string | undefined = payload.applicant_id || payload.subject_id;

  console.log('[executeEsignSendAgreement] Starting:', {
    template_id,
    output_column_id,
    applicantId,
    companyId,
    jobId,
  });

  // ── Validate config ─────────────────────────────────────────────────────────
  if (!template_id) {
    return { success: false, error: 'esign.send_agreement: template_id required' };
  }
  if (!applicantId) {
    return { success: false, error: 'esign.send_agreement: missing applicant_id in payload' };
  }

  // ── Helper: write a message to the output column ────────────────────────────
  async function writeOutput(message: string) {
    if (!output_column_id) return;
    try {
      await supabase
        .from('board_cells')
        .upsert(
          {
            applicant_id: applicantId,
            column_id: output_column_id,
            value_text: message,
            value_number: null,
            value_date: null,
            value_status_label_id: null,
            value_file_path: null,
          },
          { onConflict: 'applicant_id,column_id' }
        );
    } catch (err) {
      console.error('[executeEsignSendAgreement] writeOutput error (non-fatal):', err);
    }
  }

  // ── Idempotency check ───────────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('esign_agreements')
    .select('id, status')
    .eq('applicant_id', applicantId)
    .eq('template_id', template_id)
    .in('status', ['sent', 'signed'])
    .maybeSingle();

  if (existing) {
    const msg = existing.status === 'signed'
      ? 'eSign already completed'
      : 'eSign already sent — awaiting signature';
    await writeOutput(msg);
    console.log('[executeEsignSendAgreement] Skipping (idempotent):', msg);
    return { success: true };
  }

  // ── Fetch template ──────────────────────────────────────────────────────────
  const { data: template, error: templateErr } = await supabase
    .from('esign_templates')
    .select('*')
    .eq('id', template_id)
    .maybeSingle();

  if (templateErr || !template) {
    await writeOutput('eSign error: template not found');
    return { success: false, error: 'Template not found' };
  }

  const fieldMappings = (template.field_mappings || []) as Array<{
    adobeFieldName: string;
    source: 'column' | 'static';
    columnName?: string;
    staticValue?: string;
  }>;
  const signerConfigs = (template.signers || []) as Array<{
    order: number;
    role: 'SIGNER' | 'APPROVER';
    label: string;
    emailSource: 'column' | 'static' | 'applicant_email';
    columnName?: string;
    staticEmail?: string;
  }>;

  if (signerConfigs.length === 0) {
    await writeOutput('eSign error: no signers configured on template');
    return { success: false, error: 'No signers configured' };
  }

  // ── Fetch applicant data ────────────────────────────────────────────────────
  const { data: applicant } = await supabase
    .from('applicants')
    .select('id, full_name, email, phone')
    .eq('id', applicantId)
    .maybeSingle();

  if (!applicant) {
    await writeOutput('eSign error: applicant not found');
    return { success: false, error: 'Applicant not found' };
  }

  // ── Fetch board columns for this job's board ────────────────────────────────
  const { data: boardColumns } = await supabase
    .from('board_columns')
    .select('id, name')
    .eq('company_id', companyId);

  const columnsByName = new Map<string, string>();
  (boardColumns || []).forEach((col) => {
    columnsByName.set(col.name.toLowerCase(), col.id);
  });

  // ── Resolve column names to IDs and fetch cell values ───────────────────────
  const columnNamesToResolve = new Set<string>();
  for (const fm of fieldMappings) {
    if (fm.source === 'column' && fm.columnName) {
      columnNamesToResolve.add(fm.columnName.toLowerCase());
    }
  }
  for (const sc of signerConfigs) {
    if (sc.emailSource === 'column' && sc.columnName) {
      columnNamesToResolve.add(sc.columnName.toLowerCase());
    }
  }

  // Get column IDs for the names we need
  const neededColumnIds = [...columnNamesToResolve]
    .map((name) => columnsByName.get(name))
    .filter(Boolean) as string[];

  // Fetch board cell values for this applicant
  const cellValues = new Map<string, string>();
  if (neededColumnIds.length > 0) {
    const { data: cells } = await supabase
      .from('board_cells')
      .select('column_id, value_text, value_number, value_date')
      .eq('applicant_id', applicantId)
      .in('column_id', neededColumnIds);

    for (const cell of cells || []) {
      const value = cell.value_text || cell.value_number?.toString() || cell.value_date || '';
      if (value) cellValues.set(cell.column_id, value);
    }
  }

  // Helper to get cell value by column name
  function getColumnValue(columnName: string): string {
    const colId = columnsByName.get(columnName.toLowerCase());
    if (!colId) return '';
    return cellValues.get(colId) || '';
  }

  // ── Build merge fields ──────────────────────────────────────────────────────
  const mergeFieldInfo: Array<{ fieldName: string; defaultValue: string }> = [];
  for (const fm of fieldMappings) {
    let value = '';
    if (fm.source === 'static') {
      value = fm.staticValue || '';
    } else if (fm.source === 'column' && fm.columnName) {
      // Check built-in applicant fields first
      const lowerName = fm.columnName.toLowerCase();
      if (lowerName === 'full_name' || lowerName === 'full name') {
        value = applicant.full_name || '';
      } else if (lowerName === 'email') {
        value = applicant.email || '';
      } else if (lowerName === 'phone') {
        value = applicant.phone || '';
      } else {
        value = getColumnValue(fm.columnName);
      }
    }
    if (value) {
      mergeFieldInfo.push({ fieldName: fm.adobeFieldName, defaultValue: value });
    }
  }

  // ── Resolve signer emails ──────────────────────────────────────────────────
  const participantSetsInfo: Array<{
    memberInfos: Array<{ email: string }>;
    order: number;
    role: 'SIGNER' | 'APPROVER';
  }> = [];

  for (const sc of signerConfigs) {
    let email = '';
    if (sc.emailSource === 'applicant_email') {
      email = applicant.email || '';
    } else if (sc.emailSource === 'static') {
      email = sc.staticEmail || '';
    } else if (sc.emailSource === 'column' && sc.columnName) {
      email = getColumnValue(sc.columnName);
    }

    if (!email) {
      await writeOutput(`eSign error: no email for signer "${sc.label}"`);
      return { success: false, error: `Missing email for signer: ${sc.label}` };
    }

    participantSetsInfo.push({
      memberInfos: [{ email }],
      order: sc.order,
      role: sc.role,
    });
  }

  // ── Get Adobe Sign client ──────────────────────────────────────────────────
  const client = await getAdobeSignClient(supabase, companyId);
  if (!client) {
    await writeOutput('eSign error: Adobe Sign not connected');
    return { success: false, error: 'Adobe Sign not connected or disabled' };
  }

  // ── Create agreement ──────────────────────────────────────────────────────
  try {
    const agreementName = `${template.display_name} — ${applicant.full_name || 'Applicant'}`;

    const result = await createAgreement(client, {
      name: agreementName,
      libraryDocumentId: template.library_document_id,
      participantSetsInfo,
      mergeFieldInfo: mergeFieldInfo.length > 0 ? mergeFieldInfo : undefined,
    });

    const adobeAgreementId = result.id;
    console.log('[executeEsignSendAgreement] Agreement created:', adobeAgreementId);

    // ── Track in esign_agreements ──────────────────────────────────────────
    const { error: insertErr } = await supabase
      .from('esign_agreements')
      .insert({
        company_id: companyId,
        applicant_id: applicantId,
        job_id: jobId,
        adobe_agreement_id: adobeAgreementId,
        template_id: template_id,
        output_column_id,
        status_column_id,
        completed_label_id,
        file_column_id,
        status: 'sent',
        recipient_email: participantSetsInfo[0]?.memberInfos[0]?.email,
      });

    if (insertErr) {
      console.error('[executeEsignSendAgreement] Failed to track agreement:', insertErr);
      // Non-fatal — agreement was already sent
    }

    // ── Write status to output column ─────────────────────────────────────
    const signerNames = signerConfigs.map((s) => s.label).join(', ');
    await writeOutput(`eSign sent — awaiting signature from ${signerNames}`);

    // ── Log activity ──────────────────────────────────────────────────────
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorType: 'automation',
      eventType: 'esign.agreement.sent',
      entityType: 'applicant',
      entityId: applicantId,
      summary: `eSign agreement sent: ${template.display_name}`,
      data: {
        template_name: template.display_name,
        adobe_agreement_id: adobeAgreementId,
        signer_count: signerConfigs.length,
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error('[executeEsignSendAgreement] Error:', err);
    await writeOutput(`eSign error: ${err.message}`);
    return { success: false, error: err.message };
  }
}
