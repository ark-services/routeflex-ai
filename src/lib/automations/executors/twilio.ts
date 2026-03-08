import { SupabaseClient } from '@supabase/supabase-js';
import { ActionResult } from './types';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveVariables, fetchKnowledgeBaseContext } from './helpers';

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
  const svcClient = createServiceClient();
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

  // Inject knowledge base content
  const kbContext = await fetchKnowledgeBaseContext(supabase, jobId);
  if (kbContext) context.knowledge_base = kbContext;

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
 * Action: twilio.send_sms
 * Config: { toSource: { type: 'column'|'manual', columnId?: string, value?: string }, message: string, onlyIfPresent?: boolean }
 */
export async function executeTwilioSendSms(
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
export async function executeTwilioMakeCallSay(
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
