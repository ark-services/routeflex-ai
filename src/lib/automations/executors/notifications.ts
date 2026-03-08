import { SupabaseClient } from '@supabase/supabase-js';
import { ActionResult } from './types';
import { resolveVariables, plainTextToHtml, colNameToToken, fetchKnowledgeBaseContext } from './helpers';
import { isAllowedWebhookUrl } from './webhook';

/**
 * Action: send_email
 * Config: { to?: 'applicant' | string, subject: string, body: string }
 *
 * NOTE: This is a stub. Logs email preview to console.
 * Ready for integration with SendGrid/Resend/etc.
 */
export async function executeSendEmail(
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

  return { success: true };
}

/**
 * Action: send_slack
 * Config: { webhook_url: string, message: string }
 *
 * NOTE: This sends a message to Slack via incoming webhook.
 */
export async function executeSendSlack(
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
export async function executeEmailGmail(
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

  // Inject knowledge base content as a template variable
  const kbCtx = await fetchKnowledgeBaseContext(supabase, jobId);
  if (kbCtx) context.knowledge_base = kbCtx;

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
export async function executeSendEmailGmail(
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

  // Inject knowledge base content as a template variable
  const kbContext = await fetchKnowledgeBaseContext(supabase, jobId);
  if (kbContext) context.knowledge_base = kbContext;

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
