/**
 * Gmail sending utilities with token refresh
 */

import { google, gmail_v1 } from 'googleapis';
import { SupabaseClient } from '@supabase/supabase-js';
import { decrypt, encrypt } from './encryption';

interface GmailClient {
  gmail: gmail_v1.Gmail;
  emailAddress: string;
}

/**
 * Get Gmail client for a specific connection with automatic token refresh
 */
export async function getGmailClientForConnection(
  supabase: SupabaseClient,
  connectionId: string
): Promise<GmailClient | null> {
  // Fetch connection with encrypted tokens
  const { data: connection, error } = await supabase
    .from('gmail_connections')
    .select('id, email_address, access_token, refresh_token, token_expiry')
    .eq('id', connectionId)
    .is('revoked_at', null)
    .single();

  if (error || !connection) {
    console.error('[getGmailClientForConnection] Connection not found:', error);
    return null;
  }

  try {
    // Decrypt tokens
    const accessToken = decrypt(connection.access_token);
    const refreshToken = connection.refresh_token ? decrypt(connection.refresh_token) : null;

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: connection.token_expiry ? new Date(connection.token_expiry).getTime() : undefined,
    });

    // Set up token refresh handler
    oauth2Client.on('tokens', async (tokens) => {
      console.log('[getGmailClientForConnection] Refreshing tokens');

      const updates: any = {
        updated_at: new Date().toISOString(),
      };

      if (tokens.access_token) {
        updates.access_token = encrypt(tokens.access_token);
      }

      if (tokens.refresh_token) {
        updates.refresh_token = encrypt(tokens.refresh_token);
      }

      if (tokens.expiry_date) {
        updates.token_expiry = new Date(tokens.expiry_date).toISOString();
      }

      await supabase
        .from('gmail_connections')
        .update(updates)
        .eq('id', connectionId);
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    return {
      gmail,
      emailAddress: connection.email_address,
    };
  } catch (err: any) {
    console.error('[getGmailClientForConnection] Failed to initialize client:', err);
    return null;
  }
}

/**
 * Get Gmail client for the active company-level connection.
 * Looks up the company's active (non-revoked) connection and delegates to
 * getGmailClientForConnection.  Returns null if no connection exists.
 */
export async function getGmailClientForCompany(
  supabase: SupabaseClient,
  companyId: string
): Promise<GmailClient | null> {
  const { data: connection } = await supabase
    .from('gmail_connections')
    .select('id')
    .eq('company_id', companyId)
    .is('revoked_at', null)
    .maybeSingle();

  if (!connection) return null;
  return getGmailClientForConnection(supabase, connection.id);
}

/**
 * Send email via Gmail API
 */
/** RFC 2047 encode a header value so non-ASCII characters (e.g. em dash) survive MIME transport. */
function encodeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value; // pure ASCII — no encoding needed
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
}

export async function sendEmail(
  gmail: gmail_v1.Gmail,
  params: { to: string; subject: string; body: string; from?: string }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Build RFC 2822 formatted message
    const messageParts = [
      `To: ${params.to}`,
      `Subject: ${encodeHeader(params.subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      params.body,
    ];

    const message = messageParts.join('\n');

    // Base64url encode the message
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send via Gmail API
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return {
      success: true,
      messageId: response.data.id || undefined,
    };
  } catch (err: any) {
    console.error('[sendEmail] Failed to send:', err);
    return {
      success: false,
      error: err.message || 'Unknown error',
    };
  }
}

/**
 * Builds the standard training link email subject + HTML body.
 * Used by both the automation executor and the manual enrollment action
 * so both paths send an identical email.
 */
export function buildTrainingLinkEmail(params: {
  firstName: string;
  companyName: string;
  logoUrl?: string | null;
  trainingUrl: string;
}): { subject: string; body: string } {
  const { firstName, companyName, logoUrl, trainingUrl } = params;
  const subject = `Action required: Complete your safety training - ${companyName}`;
  const body = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a; padding: 32px 24px;">
  ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="height: 48px; margin-bottom: 28px; display: block;" />` : `<p style="font-size: 18px; font-weight: 700; margin-bottom: 28px;">${companyName}</p>`}
  <h2 style="font-size: 22px; font-weight: 700; margin: 0 0 12px;">Your safety training is ready</h2>
  <p style="font-size: 15px; color: #555; margin: 0 0 28px; line-height: 1.6;">
    Hi ${firstName}, please complete your required training before your start date.
  </p>
  <a href="${trainingUrl}"
     style="display: inline-block; background: #1a1a1a; color: #ffffff; text-decoration: none;
            padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;">
    Start Training →
  </a>
  <p style="font-size: 13px; color: #999; margin-top: 36px; line-height: 1.5;">
    This link is unique to you and does not expire.<br>
    If you have any questions, reply to this email.
  </p>
</div>`.trim();
  return { subject, body };
}
