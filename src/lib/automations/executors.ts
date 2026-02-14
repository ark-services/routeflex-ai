import { SupabaseClient } from '@supabase/supabase-js';
import { renderTemplate } from './templates';

export interface ActionResult { success: boolean; error?: string; }

export async function executeGmailAction(
  supabase: SupabaseClient, accountId: string, applicantId: string,
  config: { to_column_id: string; subject: string; body: string }
): Promise<ActionResult> {
  // Placeholder: Check for Gmail credentials
  const { data: creds } = await supabase.from('integration_credentials')
    .select('credentials').eq('account_id', accountId).eq('integration_type', 'gmail').eq('is_active', true).single();

  if (!creds) return { success: false, error: 'Gmail integration not connected' };

  // TODO: Implement Gmail API send
  return { success: true };
}

export async function executeSmsAction(
  supabase: SupabaseClient, accountId: string, applicantId: string,
  config: { to_column_id: string; message: string }
): Promise<ActionResult> {
  // Placeholder: Check for Twilio credentials
  return { success: false, error: 'SMS integration not implemented' };
}

export async function executeSlackAction(
  supabase: SupabaseClient, accountId: string, applicantId: string,
  config: { channel: string; message: string }
): Promise<ActionResult> {
  // Placeholder: Check for Slack webhook
  return { success: false, error: 'Slack integration not implemented' };
}

export async function executeMoveToGroupAction(
  supabase: SupabaseClient, companyId: string, applicantId: string,
  config: { target_group_id: string }
): Promise<ActionResult> {
  const { error } = await supabase.from('applicants')
    .update({ group_id: config.target_group_id })
    .eq('id', applicantId).eq('company_id', companyId);

  return error ? { success: false, error: error.message } : { success: true };
}
