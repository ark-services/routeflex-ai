import { SupabaseClient } from '@supabase/supabase-js';
import { ActionResult } from './types';
import { executeMoveGroup, executeSetStatus, executeChangeStatus, executeDeleteItem } from './board';
import { executeSetDate, executeSetNumber, executeIncDec, executeIntegrationSetField } from './fields';
import { executeWebhook } from './webhook';
import { executeSendEmail, executeSendSlack, executeEmailGmail, executeSendEmailGmail } from './notifications';
import { executeTwilioSendSms, executeTwilioMakeCallSay } from './twilio';
import { executeFadvAddSubject, executeFadvApproveOrder, executeSafetyTrainerSubmit } from './integrations';
import { executeLmsSendTrainingLink, executePortalSendLink } from './lms';
import { executeAiScoreResume } from './ai';

/**
 * Executes a single automation action by type.
 */
export async function executeAction(
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

    case 'fadv.approve_order':
      return executeFadvApproveOrder(supabase, companyId, jobId, config, payload);

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

export type { ActionResult } from './types';
