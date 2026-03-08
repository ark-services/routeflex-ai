import { SupabaseClient } from '@supabase/supabase-js';
import { ActionResult } from './types';

/**
 * Validate that a webhook URL is safe (not targeting internal infrastructure).
 */
export function isAllowedWebhookUrl(raw: string): boolean {
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
export async function executeWebhook(
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
